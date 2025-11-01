#!/usr/bin/env node

import { db } from './src/database/connection';

async function checkSchema() {
    console.log('🔍 Checking exact database schema...\n');
    
    try {
        const client = await db.connect();
        
        // Check contexts table structure
        console.log('1️⃣ Contexts table structure:');
        const contextsStructure = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'contexts' AND table_schema = 'public'
            ORDER BY ordinal_position
        `);
        
        contextsStructure.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
        });
        
        // Check projects table structure  
        console.log('\n2️⃣ Projects table structure:');
        const projectsStructure = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'projects' AND table_schema = 'public'
            ORDER BY ordinal_position
        `);
        
        projectsStructure.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
        });
        
        // Get a sample record to see actual data structure
        console.log('\n3️⃣ Sample contexts data:');
        const sampleData = await client.query('SELECT * FROM contexts LIMIT 1');
        if (sampleData.rows.length > 0) {
            console.log('   Available columns:', Object.keys(sampleData.rows[0]).join(', '));
        }
        
        client.release();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await db.end();
    }
}

checkSchema().catch(console.error);
