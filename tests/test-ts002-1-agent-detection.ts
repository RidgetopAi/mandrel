/**
 * TS002-1 Test: Agent Auto-Detection Functionality
 *
 * Tests the new agent detection utility and session creation
 * with auto-detected agent types.
 */

import { detectAgentType, getAgentInfo, normalizeAgentType } from './mcp-server/src/utils/agentDetection.js';
import { db } from './mcp-server/src/config/database.js';

async function runTests() {
  console.log('🧪 TS002-1: Testing Agent Auto-Detection\n');
  console.log('=' .repeat(60));

  // Test 1: Basic detection in current environment
  console.log('\n📋 Test 1: Current Environment Detection');
  console.log('-'.repeat(60));
  const agentInfo = detectAgentType();
  console.log('✅ Agent Type:', agentInfo.type);
  console.log('✅ Display Name:', agentInfo.displayName);
  console.log('✅ Confidence:', agentInfo.confidence);
  if (agentInfo.version) {
    console.log('✅ Version:', agentInfo.version);
  }

  // Test 2: Full agent info with metadata
  console.log('\n📋 Test 2: Agent Info with Metadata');
  console.log('-'.repeat(60));
  const fullInfo = getAgentInfo();
  console.log('✅ Type:', fullInfo.type);
  console.log('✅ Display Name:', fullInfo.displayName);
  console.log('✅ Confidence:', fullInfo.confidence);
  console.log('✅ Detection Time:', fullInfo.metadata.detection_time);
  console.log('✅ Environment Variables:');
  console.log('   - CLAUDECODE:', fullInfo.metadata.environment_vars.claudecode);
  console.log('   - TERM_PROGRAM:', fullInfo.metadata.environment_vars.term_program);
  console.log('   - TERM_PROGRAM_VERSION:', fullInfo.metadata.environment_vars.term_program_version);

  // Test 3: Agent type normalization (backward compatibility)
  console.log('\n📋 Test 3: Legacy Agent Type Normalization');
  console.log('-'.repeat(60));
  const legacyTypes = ['claude-code-agent', 'web', 'mcp', 'unknown-agent'];
  legacyTypes.forEach(oldType => {
    const normalized = normalizeAgentType(oldType);
    const status = oldType !== normalized ? '🔄' : '✓';
    console.log(`${status} "${oldType}" → "${normalized}"`);
  });

  // Test 4: Verify environment variables
  console.log('\n📋 Test 4: Environment Variable Check');
  console.log('-'.repeat(60));
  const envVars = [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLINE',
    'ROO_CODE',
    'WINDSURF',
    'CURSOR',
    'TERM_PROGRAM',
    'AIDIS_AGENT_TYPE',
    'AIDIS_AGENT_DISPLAY_NAME'
  ];

  envVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '❌';
    console.log(`${status} ${varName}: ${value || '(not set)'}`);
  });

  // Test 5: Expected detection result validation
  console.log('\n📋 Test 5: Detection Result Validation');
  console.log('-'.repeat(60));
  const expectedType = process.env.CLAUDECODE === '1' ? 'claude-code' : 'mcp-client';
  const expectedName = process.env.CLAUDECODE === '1' ? 'Claude Code' : 'MCP Client';
  const expectedConfidence = process.env.CLAUDECODE === '1' ? 'high' : 'low';

  console.log('Expected vs Actual:');
  console.log(`Type: ${expectedType} ${agentInfo.type === expectedType ? '✅' : '❌'} ${agentInfo.type}`);
  console.log(`Name: ${expectedName} ${agentInfo.displayName === expectedName ? '✅' : '❌'} ${agentInfo.displayName}`);
  console.log(`Confidence: ${expectedConfidence} ${agentInfo.confidence === expectedConfidence ? '✅' : '❌'} ${agentInfo.confidence}`);

  // Test 6: Database query to check if migration worked
  console.log('\n📋 Test 6: Database Migration Validation');
  console.log('-'.repeat(60));

  try {
  // Check if agent_display_name column exists
  const columnCheck = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'agent_display_name'
  `);

  if (columnCheck.rows.length > 0) {
    console.log('✅ agent_display_name column exists');
    console.log('   Type:', columnCheck.rows[0].data_type);
    console.log('   Nullable:', columnCheck.rows[0].is_nullable);
  } else {
    console.log('❌ agent_display_name column NOT FOUND');
  }

  // Check if index exists
  const indexCheck = await db.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'sessions'
      AND indexname = 'idx_sessions_agent_display_name'
  `);

  if (indexCheck.rows.length > 0) {
    console.log('✅ idx_sessions_agent_display_name index exists');
  } else {
    console.log('❌ idx_sessions_agent_display_name index NOT FOUND');
  }

  // Check updated agent_type values
  const typeDistribution = await db.query(`
    SELECT agent_type, COUNT(*) as count
    FROM sessions
    GROUP BY agent_type
    ORDER BY count DESC
  `);

  console.log('\n✅ Agent Type Distribution:');
  typeDistribution.rows.forEach(row => {
    console.log(`   ${row.agent_type}: ${row.count} sessions`);
  });

  // Check if agent_display_name is populated
  const displayNameCheck = await db.query(`
    SELECT COUNT(*) as total,
           COUNT(agent_display_name) as with_display_name
    FROM sessions
  `);

  const total = parseInt(displayNameCheck.rows[0].total);
  const withName = parseInt(displayNameCheck.rows[0].with_display_name);
  const percentage = total > 0 ? ((withName / total) * 100).toFixed(1) : '0.0';

  console.log(`\n✅ Display Name Population: ${withName}/${total} (${percentage}%)`);

  } catch (error) {
    console.error('❌ Database validation error:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 TS002-1 Test Complete!\n');

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});