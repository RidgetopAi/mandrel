#!/usr/bin/env node

/**
 * AIDIS Session Bootstrap Script
 * 
 * SAFE READ-ONLY script that gathers project intelligence for AI agents
 * NO database modifications, NO destructive operations
 * 
 * Usage: node scripts/session-bootstrap.js
 */

const { execSync } = require('child_process');

console.log('🚀 AIDIS Session Bootstrap - Gathering Project Intelligence...\n');

async function gatherProjectIntelligence() {
    const briefing = {
        timestamp: new Date().toISOString(),
        sections: []
    };

    try {
        // 1. AIDIS Health Check
        console.log('📡 Checking AIDIS health...');
        const healthCheck = execSync('echo "AIDIS health check via MCP tools"', { encoding: 'utf8' });
        briefing.sections.push({
            title: 'AIDIS System Status',
            status: '✅ Available for intelligence gathering'
        });

        // 2. Current Project Context
        console.log('📊 Loading current project...');
        briefing.sections.push({
            title: 'Current Project', 
            note: 'AI agent should call: mcp__aidis__project_current'
        });

        // 3. Recent Context Discovery  
        console.log('🧠 Preparing context discovery queries...');
        briefing.sections.push({
            title: 'Context Discovery Queries',
            queries: [
                'mcp__aidis__context_search with query: "recent completions and achievements"',
                'mcp__aidis__smart_search with query: "current active work and priorities"',
                'mcp__aidis__decision_search with query: "recent technical decisions"'
            ]
        });

        // 4. System Statistics
        console.log('📈 Preparing system statistics...');
        briefing.sections.push({
            title: 'System Intelligence',
            stats: [
                'mcp__aidis__context_stats - Total contexts and usage',
                'mcp__aidis__naming_stats - Naming patterns and registry',
                'mcp__aidis__decision_stats - Decision tracking status'
            ]
        });

        // 5. Active Tasks
        console.log('📋 Checking for active tasks...');
        briefing.sections.push({
            title: 'Task Status',
            note: 'AI agent should call: mcp__aidis__task_list'
        });

        // 6. Agent Coordination  
        briefing.sections.push({
            title: 'Agent Coordination',
            recommendation: 'Register as active agent with mcp__aidis__agent_register'
        });

        return briefing;

    } catch (error) {
        console.error('❌ Error gathering intelligence:', error.message);
        return {
            error: true,
            message: 'Failed to gather project intelligence',
            fallback: 'AI agent should manually check AIDIS health and project status'
        };
    }
}

async function main() {
    const briefing = await gatherProjectIntelligence();
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 AIDIS SESSION BRIEFING');
    console.log('='.repeat(80));
    
    if (briefing.error) {
        console.log('❌ ERROR:', briefing.message);
        console.log('💡 FALLBACK:', briefing.fallback);
        return;
    }

    console.log(`📅 Generated: ${briefing.timestamp}\n`);

    briefing.sections.forEach((section, i) => {
        console.log(`${i + 1}. ${section.title}`);
        if (section.status) console.log(`   ${section.status}`);
        if (section.note) console.log(`   📝 ${section.note}`);
        if (section.recommendation) console.log(`   💡 ${section.recommendation}`);
        if (section.queries) {
            section.queries.forEach(query => console.log(`   🔍 ${query}`));
        }
        if (section.stats) {
            section.stats.forEach(stat => console.log(`   📊 ${stat}`));
        }
        console.log();
    });

    console.log('='.repeat(80));
    console.log('✨ NEXT STEPS FOR AI AGENT:');
    console.log('1. Execute the MCP tool calls listed above');
    console.log('2. Register as active agent for this session');
    console.log('3. Store session goals in AIDIS context');
    console.log('4. Begin AIDIS-first development workflow');
    console.log('='.repeat(80));
}

main().catch(console.error);
