#!/usr/bin/env node

const { Pool } = require('pg');

const dbConfig = {
  user: 'ridgetop',
  host: 'localhost', 
  database: 'aidis_development',
  password: 'bandy',
  port: 5432,
};

async function checkTables() {
    console.log('🔍 Debugging AIDIS Command Database Tables...\n');
    
    const pool = new Pool(dbConfig);
    
    try {
        // Check database connection
        console.log('1️⃣ Testing database connection...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
        console.log('✅ Connected to:', result.rows[0].db_name);
        console.log('   Time:', result.rows[0].current_time);
        
        // List all tables
        console.log('\n2️⃣ Listing all tables...');
        const tablesResult = await client.query(`
            SELECT table_name, table_schema 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        if (tablesResult.rows.length === 0) {
            console.log('❌ No tables found in public schema!');
        } else {
            console.log('✅ Found tables:');
            tablesResult.rows.forEach(row => {
                console.log(`   - ${row.table_name}`);
            });
        }
        
        // Check if contexts table exists and has data
        console.log('\n3️⃣ Checking contexts table...');
        try {
            const contextsResult = await client.query('SELECT COUNT(*) as count FROM contexts');
            console.log('✅ Contexts table exists');
            console.log('   Records:', contextsResult.rows[0].count);
            
            // Check table structure
            const structureResult = await client.query(`
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'contexts' 
                ORDER BY ordinal_position
            `);
            
            console.log('   Columns:');
            structureResult.rows.forEach(row => {
                console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
            });
        } catch (error) {
            console.log('❌ Contexts table issue:', error.message);
        }
        
        // Check if projects table exists
        console.log('\n4️⃣ Checking projects table...');
        try {
            const projectsResult = await client.query('SELECT COUNT(*) as count FROM projects');
            console.log('✅ Projects table exists');
            console.log('   Records:', projectsResult.rows[0].count);
        } catch (error) {
            console.log('❌ Projects table issue:', error.message);
        }
        
        // Check if admin_users table exists
        console.log('\n5️⃣ Checking admin_users table...');
        try {
            const usersResult = await client.query('SELECT COUNT(*) as count FROM admin_users');
            console.log('✅ Admin_users table exists');
            console.log('   Records:', usersResult.rows[0].count);
        } catch (error) {
            console.log('❌ Admin_users table issue:', error.message);
        }
        
        client.release();
        
    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await pool.end();
    }
}

checkTables().catch(console.error);
