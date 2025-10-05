import { Pool } from 'pg';
import { db } from '../config/database.js';

export interface Agent {
    id: string;
    name: string;
    type: string;
    capabilities: string[];
    status: 'active' | 'busy' | 'offline' | 'error';
    metadata: Record<string, any>;
    lastSeen: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface AgentTask {
    id: string;
    projectId: string;
    assignedTo?: string;
    createdBy?: string;
    title: string;
    description?: string;
    type: string;
    status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dependencies: string[];
    tags: string[];
    metadata: Record<string, any>;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface AgentMessage {
    id: string;
    projectId: string;
    fromAgentId: string;
    toAgentId?: string;
    messageType: string;
    title?: string;
    content: string;
    contextRefs: string[];
    taskRefs: string[];
    metadata: Record<string, any>;
    readAt?: Date;
    createdAt: Date;
}

export interface AgentCollaboration {
    id: string;
    projectId: string;
    agents: string[];
    type: string;
    title: string;
    description?: string;
    status: 'active' | 'paused' | 'completed';
    result?: string;
    contexts: string[];
    tasks: string[];
    metadata: Record<string, any>;
    startedAt: Date;
    completedAt?: Date;
    updatedAt: Date;
}

export class AgentsHandler {
    constructor(private pool: Pool = db) {}

    async registerAgent(
        name: string,
        type: string = 'ai_assistant',
        capabilities: string[] = ['coding'],
        metadata: Record<string, any> = {}
    ): Promise<Agent> {
        console.log(`🤖 Agent register request: "${name}"`);
        
        const client = await this.pool.connect();
        try {
            // Check if agent already exists
            const existingResult = await client.query(
                'SELECT id FROM agents WHERE name = $1',
                [name]
            );

            if (existingResult.rows.length > 0) {
                // Update existing agent
                const result = await client.query(
                    `UPDATE agents 
                     SET type = $2, capabilities = $3, status = 'active', metadata = $4, 
                         last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                     WHERE name = $1
                     RETURNING id, name, type, capabilities, status, metadata, 
                               last_seen, created_at, updated_at`,
                    [name, type, capabilities, metadata]
                );
                
                console.log(`✅ Updated existing agent: ${name}`);
                return this.mapAgent(result.rows[0]);
            } else {
                // Create new agent
                const result = await client.query(
                    `INSERT INTO agents (name, type, capabilities, metadata)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id, name, type, capabilities, status, metadata,
                               last_seen, created_at, updated_at`,
                    [name, type, capabilities, metadata]
                );
                
                console.log(`✅ Registered new agent: ${name}`);
                return this.mapAgent(result.rows[0]);
            }
        } finally {
            client.release();
        }
    }

    async updateAgentStatus(
        agentId: string,
        status: Agent['status'],
        metadata?: Record<string, any>
    ): Promise<void> {
        console.log(`🔄 Updating agent ${agentId} status to: ${status}`);
        
        const client = await this.pool.connect();
        try {
            // Resolve agent name to UUID if needed
            let agentUuid = agentId;
            if (!this.isUUID(agentId)) {
                const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [agentId]);
                if (agentResult.rows.length > 0) {
                    agentUuid = agentResult.rows[0].id;
                    console.log(`🔍 Resolved agent "${agentId}" to ID: ${agentUuid}`);
                } else {
                    throw new Error(`Agent "${agentId}" not found`);
                }
            }

            const updateData: any[] = [status, agentUuid];
            let query = `UPDATE agents 
                        SET status = $1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`;
            
            if (metadata) {
                query += `, metadata = $3`;
                updateData.splice(1, 0, metadata);
            }
            
            query += ` WHERE id = $${updateData.length}`;
            
            await client.query(query, updateData);
            console.log(`✅ Updated agent status`);
        } finally {
            client.release();
        }
    }

    async listAgents(projectId?: string): Promise<Agent[]> {
        console.log(`📋 Listing agents${projectId ? ` for project ${projectId}` : ''}`);
        
        const client = await this.pool.connect();
        try {
            let query = `SELECT id, name, type, capabilities, status, metadata,
                               last_seen, created_at, updated_at FROM agents`;
            let params: any[] = [];
            
            if (projectId) {
                // Show agents who have tasks assigned in this project OR have active sessions
                query += ` WHERE id IN (
                    SELECT DISTINCT assigned_to FROM agent_tasks 
                    WHERE project_id = $1 AND assigned_to IS NOT NULL
                    UNION
                    SELECT DISTINCT agent_id FROM agent_sessions 
                    WHERE project_id = $1 AND status = 'active'
                )`;
                params = [projectId];
            }
            
            query += ` ORDER BY last_seen DESC`;
            
            const result = await client.query(query, params);
            console.log(`✅ Found ${result.rows.length} agents`);
            return result.rows.map(row => this.mapAgent(row));
        } finally {
            client.release();
        }
    }

    async createTask(
        projectId: string,
        title: string,
        description?: string,
        type: string = 'general',
        priority: AgentTask['priority'] = 'medium',
        assignedTo?: string,
        createdBy?: string,
        tags: string[] = [],
        dependencies: string[] = [],
        metadata: Record<string, any> = {}
    ): Promise<AgentTask> {
        console.log(`📋 Creating task: "${title}"`);
        
        const client = await this.pool.connect();
        try {
            // Convert agent names to IDs if needed
            let assignedToId = assignedTo;
            let createdById = createdBy;

            if (assignedTo && !this.isUUID(assignedTo)) {
                const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [assignedTo]);
                if (agentResult.rows.length > 0) {
                    assignedToId = agentResult.rows[0].id;
                    console.log(`🔍 Resolved agent "${assignedTo}" to ID: ${assignedToId}`);
                } else {
                    console.log(`⚠️  Agent "${assignedTo}" not found, leaving unassigned`);
                    assignedToId = undefined;
                }
            }

            if (createdBy && !this.isUUID(createdBy)) {
                const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [createdBy]);
                if (agentResult.rows.length > 0) {
                    createdById = agentResult.rows[0].id;
                    console.log(`🔍 Resolved creator "${createdBy}" to ID: ${createdById}`);
                } else {
                    createdById = undefined;
                }
            }

            const result = await client.query(
                `INSERT INTO agent_tasks 
                 (project_id, title, description, type, priority, assigned_to, created_by, tags, dependencies, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id, project_id, assigned_to, created_by, title, description, type, status, 
                           priority, dependencies, tags, metadata, started_at, completed_at, created_at, updated_at`,
                [projectId, title, description, type, priority, assignedToId, createdById, tags, dependencies, metadata]
            );
            
            console.log(`✅ Created task: ${result.rows[0].id}`);
            return this.mapTask(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async joinProject(agentId: string, sessionId: string, projectId: string): Promise<void> {
        console.log(`🔗 Agent ${agentId} joining project ${projectId} (session: ${sessionId})`);
        
        const client = await this.pool.connect();
        try {
            // Check if session already exists
            const existingResult = await client.query(
                'SELECT id FROM agent_sessions WHERE agent_id = $1 AND session_id = $2 AND project_id = $3',
                [agentId, sessionId, projectId]
            );

            if (existingResult.rows.length > 0) {
                // Update existing session
                await client.query(
                    `UPDATE agent_sessions 
                     SET status = 'active', last_activity = CURRENT_TIMESTAMP 
                     WHERE agent_id = $1 AND session_id = $2 AND project_id = $3`,
                    [agentId, sessionId, projectId]
                );
                console.log(`✅ Updated existing agent session`);
            } else {
                // Create new session
                await client.query(
                    `INSERT INTO agent_sessions (agent_id, session_id, project_id, status)
                     VALUES ($1, $2, $3, 'active')`,
                    [agentId, sessionId, projectId]
                );
                console.log(`✅ Created new agent session`);
            }

            // Update agent last_seen
            await client.query(
                'UPDATE agents SET last_seen = CURRENT_TIMESTAMP WHERE id = $1',
                [agentId]
            );
        } finally {
            client.release();
        }
    }

    async leaveProject(agentId: string, sessionId: string, projectId: string): Promise<void> {
        console.log(`👋 Agent ${agentId} leaving project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            await client.query(
                `UPDATE agent_sessions 
                 SET status = 'disconnected', last_activity = CURRENT_TIMESTAMP 
                 WHERE agent_id = $1 AND session_id = $2 AND project_id = $3`,
                [agentId, sessionId, projectId]
            );
            console.log(`✅ Agent session marked as disconnected`);
        } finally {
            client.release();
        }
    }

    async getActiveAgentSessions(projectId: string): Promise<any[]> {
        console.log(`🔍 Getting active agent sessions for project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    s.id as session_id,
                    s.agent_id,
                    s.session_id as session_name,
                    s.status,
                    s.started_at,
                    s.last_activity,
                    a.name as agent_name,
                    a.type as agent_type,
                    a.status as agent_status
                FROM agent_sessions s
                JOIN agents a ON s.agent_id = a.id
                WHERE s.project_id = $1 AND s.status = 'active'
                ORDER BY s.last_activity DESC
            `, [projectId]);
            
            console.log(`✅ Found ${result.rows.length} active sessions`);
            return result.rows;
        } finally {
            client.release();
        }
    }

    async checkTaskConflicts(taskId: string, newAssignedTo: string): Promise<{ hasConflict: boolean; conflicts: any[] }> {
        console.log(`🔍 Checking conflicts for task ${taskId} assignment to ${newAssignedTo}`);
        
        const client = await this.pool.connect();
        try {
            // Convert agent name to ID if needed
            let agentId = newAssignedTo;
            if (!this.isUUID(newAssignedTo)) {
                const agentResult = await client.query('SELECT id, name FROM agents WHERE name = $1', [newAssignedTo]);
                if (agentResult.rows.length > 0) {
                    agentId = agentResult.rows[0].id;
                } else {
                    throw new Error(`Agent "${newAssignedTo}" not found`);
                }
            }

            // Check for conflicts: same agent working on dependent tasks, too many high-priority tasks, etc.
            const conflicts = [];

            // 1. Check if agent already has too many high-priority tasks
            const highPriorityResult = await client.query(`
                SELECT COUNT(*) as count 
                FROM agent_tasks 
                WHERE assigned_to = $1 AND priority IN ('high', 'urgent') AND status IN ('todo', 'in_progress')
            `, [agentId]);
            
            const highPriorityCount = parseInt(highPriorityResult.rows[0].count);
            if (highPriorityCount >= 3) {
                conflicts.push({
                    type: 'workload',
                    severity: 'medium',
                    message: `Agent has ${highPriorityCount} high-priority tasks already`,
                    suggestion: 'Consider redistributing workload or lowering task priority'
                });
            }

            // 2. Check if agent is working on a dependency of this task
            const depResult = await client.query(`
                SELECT t1.title as dependent_task, t2.title as dependency_task
                FROM agent_tasks t1, agent_tasks t2
                WHERE t1.id = $1 AND t2.assigned_to = $2 
                AND t2.id = ANY(t1.dependencies) AND t2.status IN ('todo', 'in_progress')
            `, [taskId, agentId]);

            if (depResult.rows.length > 0) {
                conflicts.push({
                    type: 'dependency',
                    severity: 'high',
                    message: `Agent is working on dependencies of this task`,
                    details: depResult.rows,
                    suggestion: 'Complete dependencies first or assign to different agent'
                });
            }

            // 3. Check if agent is offline or in error state
            const agentStatusResult = await client.query(
                'SELECT status FROM agents WHERE id = $1',
                [agentId]
            );
            
            if (agentStatusResult.rows.length > 0) {
                const status = agentStatusResult.rows[0].status;
                if (status === 'offline' || status === 'error') {
                    conflicts.push({
                        type: 'availability',
                        severity: 'high',
                        message: `Agent is currently ${status}`,
                        suggestion: 'Assign to an active agent or update agent status'
                    });
                }
            }

            console.log(`✅ Found ${conflicts.length} potential conflicts`);
            return {
                hasConflict: conflicts.length > 0,
                conflicts
            };
        } finally {
            client.release();
        }
    }

    async resolveTaskConflict(taskId: string, resolution: 'reassign' | 'split' | 'priority' | 'defer', metadata: Record<string, any> = {}): Promise<void> {
        console.log(`🔧 Resolving task conflict for ${taskId} with resolution: ${resolution}`);
        
        const client = await this.pool.connect();
        try {
            switch (resolution) {
                case 'reassign':
                    if (metadata.newAssignee) {
                        await this.updateTaskStatus(taskId, 'todo', metadata.newAssignee, {
                            conflict_resolution: 'reassigned',
                            previous_assignee: metadata.previousAssignee,
                            resolved_at: new Date().toISOString(),
                            ...metadata
                        });
                    }
                    break;
                    
                case 'split':
                    // Mark original task as blocked and create subtasks
                    await this.updateTaskStatus(taskId, 'blocked', undefined, {
                        conflict_resolution: 'split_into_subtasks',
                        split_reason: metadata.reason,
                        resolved_at: new Date().toISOString()
                    });
                    break;
                    
                case 'priority':
                    // Update task priority
                    await client.query(
                        'UPDATE agent_tasks SET priority = $1, metadata = metadata || $2 WHERE id = $3',
                        [metadata.newPriority, { conflict_resolution: 'priority_adjusted', resolved_at: new Date().toISOString() }, taskId]
                    );
                    break;
                    
                case 'defer':
                    await this.updateTaskStatus(taskId, 'todo', undefined, {
                        conflict_resolution: 'deferred',
                        defer_reason: metadata.reason,
                        defer_until: metadata.deferUntil,
                        resolved_at: new Date().toISOString()
                    });
                    break;
            }
            
            console.log(`✅ Conflict resolved using ${resolution} strategy`);
        } finally {
            client.release();
        }
    }

    private isUUID(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    async updateTaskStatus(
        taskId: string,
        status: AgentTask['status'],
        assignedTo?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        console.log(`🔄 Updating task ${taskId} status to: ${status}`);
        
        const client = await this.pool.connect();
        try {
            const updates: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
            const params: any[] = [status];
            let paramIndex = 2;

            if (status === 'in_progress' && !assignedTo) {
                updates.push(`started_at = CURRENT_TIMESTAMP`);
            } else if (status === 'completed') {
                updates.push(`completed_at = CURRENT_TIMESTAMP`);
            }

            if (assignedTo !== undefined) {
                // Convert agent name to ID if needed
                let assignedToId = assignedTo;
                if (assignedTo && !this.isUUID(assignedTo)) {
                    const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [assignedTo]);
                    if (agentResult.rows.length > 0) {
                        assignedToId = agentResult.rows[0].id;
                        console.log(`🔍 Resolved agent "${assignedTo}" to ID: ${assignedToId}`);
                    } else {
                        console.log(`⚠️  Agent "${assignedTo}" not found, setting to null`);
                        assignedToId = null;
                    }
                }
                
                updates.push(`assigned_to = $${paramIndex}`);
                params.push(assignedToId);
                paramIndex++;
            }

            if (metadata !== undefined) {
                updates.push(`metadata = $${paramIndex}`);
                params.push(metadata);
                paramIndex++;
            }

            params.push(taskId);
            
            const query = `UPDATE agent_tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
            await client.query(query, params);
            
            console.log(`✅ Updated task status`);
        } finally {
            client.release();
        }
    }

    async listTasks(
        projectId: string,
        assignedTo?: string,
        status?: AgentTask['status'],
        type?: string
    ): Promise<AgentTask[]> {
        console.log(`📋 Listing tasks for project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            let query = `SELECT id, project_id, assigned_to, created_by, title, description, type, status,
                               priority, dependencies, tags, metadata, started_at, completed_at, created_at, updated_at
                        FROM agent_tasks WHERE project_id = $1`;
            const params: any[] = [projectId];
            let paramIndex = 2;

            if (assignedTo !== undefined) {
                // Convert agent name to ID if needed
                let assignedToId = assignedTo;
                if (!this.isUUID(assignedTo)) {
                    const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [assignedTo]);
                    if (agentResult.rows.length > 0) {
                        assignedToId = agentResult.rows[0].id;
                        console.log(`🔍 Resolved filter agent "${assignedTo}" to ID: ${assignedToId}`);
                    } else {
                        console.log(`⚠️  Agent "${assignedTo}" not found for filtering`);
                        // Return empty results since agent doesn't exist
                        return [];
                    }
                }
                
                query += ` AND assigned_to = $${paramIndex}`;
                params.push(assignedToId);
                paramIndex++;
            }

            if (status !== undefined) {
                query += ` AND status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (type !== undefined) {
                query += ` AND type = $${paramIndex}`;
                params.push(type);
                paramIndex++;
            }

            query += ` ORDER BY priority DESC, created_at DESC`;
            
            const result = await client.query(query, params);
            console.log(`✅ Found ${result.rows.length} tasks`);
            return result.rows.map(row => this.mapTask(row));
        } finally {
            client.release();
        }
    }

    async sendMessage(
        projectId: string,
        fromAgentId: string,
        content: string,
        toAgentId?: string,
        messageType: string = 'info',
        title?: string,
        contextRefs: string[] = [],
        taskRefs: string[] = [],
        metadata: Record<string, any> = {}
    ): Promise<AgentMessage> {
        console.log(`💬 Sending message from ${fromAgentId}${toAgentId ? ` to ${toAgentId}` : ' (broadcast)'}`);
        
        const client = await this.pool.connect();
        try {
            // Convert agent names to IDs if needed
            let fromAgentUuid = fromAgentId;
            let toAgentUuid = toAgentId;

            if (!this.isUUID(fromAgentId)) {
                const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [fromAgentId]);
                if (agentResult.rows.length > 0) {
                    fromAgentUuid = agentResult.rows[0].id;
                    console.log(`🔍 Resolved sender "${fromAgentId}" to ID: ${fromAgentUuid}`);
                } else {
                    throw new Error(`Sender agent "${fromAgentId}" not found`);
                }
            }

            if (toAgentId && !this.isUUID(toAgentId)) {
                const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [toAgentId]);
                if (agentResult.rows.length > 0) {
                    toAgentUuid = agentResult.rows[0].id;
                    console.log(`🔍 Resolved recipient "${toAgentId}" to ID: ${toAgentUuid}`);
                } else {
                    console.log(`⚠️  Recipient agent "${toAgentId}" not found, sending as broadcast`);
                    toAgentUuid = null;
                }
            }

            const result = await client.query(
                `INSERT INTO agent_messages 
                 (project_id, from_agent_id, to_agent_id, message_type, title, content, context_refs, task_refs, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id, project_id, from_agent_id, to_agent_id, message_type, title, content,
                           context_refs, task_refs, metadata, read_at, created_at`,
                [projectId, fromAgentUuid, toAgentUuid, messageType, title, content, contextRefs, taskRefs, metadata]
            );
            
            console.log(`✅ Message sent: ${result.rows[0].id}`);
            return this.mapMessage(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async getMessages(
        projectId: string,
        agentId?: string,
        messageType?: string,
        unreadOnly: boolean = false
    ): Promise<AgentMessage[]> {
        console.log(`📨 Getting messages for project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            let query = `SELECT id, project_id, from_agent_id, to_agent_id, message_type, title, content,
                               context_refs, task_refs, metadata, read_at, created_at
                        FROM agent_messages WHERE project_id = $1`;
            const params: any[] = [projectId];
            let paramIndex = 2;

            if (agentId) {
                // Convert agent name to ID if needed
                let agentUuid = agentId;
                if (!this.isUUID(agentId)) {
                    const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [agentId]);
                    if (agentResult.rows.length > 0) {
                        agentUuid = agentResult.rows[0].id;
                        console.log(`🔍 Resolved message filter agent "${agentId}" to ID: ${agentUuid}`);
                    } else {
                        console.log(`⚠️  Agent "${agentId}" not found for message filtering`);
                        return [];
                    }
                }
                
                query += ` AND (to_agent_id = $${paramIndex} OR to_agent_id IS NULL)`;
                params.push(agentUuid);
                paramIndex++;
            }

            if (messageType) {
                query += ` AND message_type = $${paramIndex}`;
                params.push(messageType);
                paramIndex++;
            }

            if (unreadOnly) {
                query += ` AND read_at IS NULL`;
            }

            query += ` ORDER BY created_at DESC`;
            
            const result = await client.query(query, params);
            console.log(`✅ Found ${result.rows.length} messages`);
            return result.rows.map(row => this.mapMessage(row));
        } finally {
            client.release();
        }
    }

    async startCollaboration(
        projectId: string,
        agents: string[],
        title: string,
        type: string = 'general',
        description?: string,
        metadata: Record<string, any> = {}
    ): Promise<AgentCollaboration> {
        console.log(`🤝 Starting collaboration: "${title}" with ${agents.length} agents`);
        
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO agent_collaborations 
                 (project_id, agents, title, type, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, project_id, agents, type, title, description, status, result,
                           contexts, tasks, metadata, started_at, completed_at, updated_at`,
                [projectId, agents, title, type, description, metadata]
            );
            
            console.log(`✅ Started collaboration: ${result.rows[0].id}`);
            return this.mapCollaboration(result.rows[0]);
        } finally {
            client.release();
        }
    }

    private mapAgent(row: any): Agent {
        return {
            id: row.id,
            name: row.name,
            type: row.type,
            capabilities: row.capabilities || [],
            status: row.status,
            metadata: row.metadata || {},
            lastSeen: row.last_seen,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    private mapTask(row: any): AgentTask {
        return {
            id: row.id,
            projectId: row.project_id,
            assignedTo: row.assigned_to,
            createdBy: row.created_by,
            title: row.title,
            description: row.description,
            type: row.type,
            status: row.status,
            priority: row.priority,
            dependencies: row.dependencies || [],
            tags: row.tags || [],
            metadata: row.metadata || {},
            startedAt: row.started_at,
            completedAt: row.completed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    private mapMessage(row: any): AgentMessage {
        return {
            id: row.id,
            projectId: row.project_id,
            fromAgentId: row.from_agent_id,
            toAgentId: row.to_agent_id,
            messageType: row.message_type,
            title: row.title,
            content: row.content,
            contextRefs: row.context_refs || [],
            taskRefs: row.task_refs || [],
            metadata: row.metadata || {},
            readAt: row.read_at,
            createdAt: row.created_at
        };
    }

    private mapCollaboration(row: any): AgentCollaboration {
        return {
            id: row.id,
            projectId: row.project_id,
            agents: row.agents || [],
            type: row.type,
            title: row.title,
            description: row.description,
            status: row.status,
            result: row.result,
            contexts: row.contexts || [],
            tasks: row.tasks || [],
            metadata: row.metadata || {},
            startedAt: row.started_at,
            completedAt: row.completed_at,
            updatedAt: row.updated_at
        };
    }
}

// Export singleton instance
export const agentsHandler = new AgentsHandler();
