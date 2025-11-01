#!/usr/bin/env node

import { ContextService } from './src/services/context';
import { db } from './src/database/connection';

async function debugContextService() {
    console.log('🔍 Debugging Context Service Database Connection...\n');
    
    try {
        // Test direct database connection
        console.log('1️⃣ Testing database connection...');
        const client = await db.connect();
        const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
        console.log('✅ Database connected:', result.rows[0].db_name);
        console.log('   Time:', result.rows[0].current_time);
        
        // Check if contexts table exists
        console.log('\n2️⃣ Checking contexts table...');
        try {
            const contextCheck = await client.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = 'contexts' AND table_schema = 'public'
            `);
            
            if (contextCheck.rows[0].count === '1') {
                console.log('✅ Contexts table exists');
                
                // Check table structure
                const structure = await client.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'contexts' AND table_schema = 'public'
                    ORDER BY ordinal_position
                `);
                
                console.log('   Table structure:');
                structure.rows.forEach(row => {
                    console.log(`   - ${row.column_name}: ${row.data_type}`);
                });
                
                // Check if table has any data
                const dataCheck = await client.query('SELECT COUNT(*) as count FROM contexts');
                console.log(`   Records: ${dataCheck.rows[0].count}`);
                
                // Try to get some sample data
                if (parseInt(dataCheck.rows[0].count) > 0) {
                    const sampleData = await client.query('SELECT id, type, LEFT(content, 50) as content_preview FROM contexts LIMIT 3');
                    console.log('   Sample records:');
                    sampleData.rows.forEach(row => {
                        console.log(`   - ${row.id}: ${row.type} - "${row.content_preview}..."`);
                    });
                }
                
            } else {
                console.log('❌ Contexts table does not exist!');
            }
        } catch (error) {
            console.log('❌ Error checking contexts table:', error.message);
        }
        
        // Check projects table
        console.log('\n3️⃣ Checking projects table...');
        try {
            const projectCheck = await client.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = 'projects' AND table_schema = 'public'
            `);
            
            if (projectCheck.rows[0].count === '1') {
                console.log('✅ Projects table exists');
                const projectData = await client.query('SELECT COUNT(*) as count FROM projects');
                console.log(`   Records: ${projectData.rows[0].count}`);
            } else {
                console.log('❌ Projects table does not exist!');
            }
        } catch (error) {
            console.log('❌ Error checking projects table:', error.message);
        }
        
        client.release();
        
        // Test the actual Context Service
        console.log('\n4️⃣ Testing ContextService.searchContexts()...');
        try {
            const searchResult = await ContextService.searchContexts({
                limit: 5,
                offset: 0
            });
            
            console.log('✅ ContextService.searchContexts() successful');
            console.log(`   Total: ${searchResult.total}`);
            console.log(`   Returned: ${searchResult.contexts.length}`);
            console.log(`   Page: ${searchResult.page}`);
            
        } catch (error) {
            console.log('❌ ContextService.searchContexts() failed:', error.message);
            console.log('   Stack:', error.stack);
        }
        
        // Test context stats
        console.log('\n5️⃣ Testing ContextService.getContextStats()...');
        try {
            const stats = await ContextService.getContextStats();
            console.log('✅ ContextService.getContextStats() successful');
            console.log('   Stats:', JSON.stringify(stats, null, 2));
        } catch (error) {
            console.log('❌ ContextService.getContextStats() failed:', error.message);
            console.log('   Stack:', error.stack);
        }
        
    } catch (error) {
        console.error('❌ Overall test failed:', error.message);
        console.error('   Stack:', error.stack);
    } finally {
        await db.end();
    }
}

debugContextService().catch(console.error);
