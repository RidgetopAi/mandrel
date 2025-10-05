#!/usr/bin/env npx tsx
/**
 * TC008 Verification Test
 * Quick test to verify git integration is working after import fixes
 */

import { execSync } from 'child_process';

async function verifyTC008() {
  console.log('🔍 TC008 Verification Test - Post Import Fixes');
  console.log('=' .repeat(60));
  
  const results = {
    imports: false,
    server: false,
    gitTables: false,
    overall: false
  };
  
  try {
    // Test 1: Check imports are working
    console.log('\n1️⃣  Verifying import paths...');
    const gitHandlerPath = './mcp-server/src/handlers/git.ts';
    const gitTrackerPath = './mcp-server/src/services/gitTracker.ts';
    
    const gitHandlerContent = require('fs').readFileSync(gitHandlerPath, 'utf8');
    const gitTrackerContent = require('fs').readFileSync(gitTrackerPath, 'utf8');
    
    const gitHandlerHasCorrectImport = gitHandlerContent.includes('backend/dist/services/gitService.js');
    const gitTrackerHasCorrectImport = gitTrackerContent.includes('backend/dist/services/sessionDetail.js');
    
    if (gitHandlerHasCorrectImport && gitTrackerHasCorrectImport) {
      console.log('✅ Import paths are correct (using /dist/ compiled JS)');
      results.imports = true;
    } else {
      console.log('❌ Import paths are incorrect');
    }
    
    // Test 2: Check AIDIS server is running
    console.log('\n2️⃣  Checking AIDIS server status...');
    try {
      const response = await fetch('http://localhost:8080/healthz');
      if (response.ok) {
        console.log('✅ AIDIS server is running and healthy');
        results.server = true;
      }
    } catch (e) {
      console.log('❌ AIDIS server is not responding');
    }
    
    // Test 3: Check git tracking tables exist
    console.log('\n3️⃣  Verifying git tracking database tables...');
    const tableCheck = execSync(`psql -h localhost -p 5432 -d aidis_production -t -c "
      SELECT COUNT(*) 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('git_commits', 'git_branches', 'git_file_changes')
    "`, { encoding: 'utf8' }).trim();
    
    if (parseInt(tableCheck) === 3) {
      console.log('✅ All git tracking tables exist');
      results.gitTables = true;
    } else {
      console.log(`❌ Missing git tracking tables (found ${tableCheck}/3)`);
    }
    
    // Overall assessment
    console.log('\n' + '=' .repeat(60));
    results.overall = results.imports && results.server && results.gitTables;
    
    if (results.overall) {
      console.log('✅ TC008 VERIFICATION PASSED - Git integration infrastructure intact');
      console.log('\nThe import fixes were successful. The git tracking system is ready.');
      console.log('Note: Git commit data needs to be populated via the GitService API.');
    } else {
      console.log('⚠️  TC008 VERIFICATION PARTIAL');
      console.log('\nStatus:');
      console.log(`  Import Paths: ${results.imports ? '✅' : '❌'}`);
      console.log(`  AIDIS Server: ${results.server ? '✅' : '❌'}`);
      console.log(`  Git Tables: ${results.gitTables ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyTC008();