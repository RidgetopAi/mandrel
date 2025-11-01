/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseEntity } from './BaseEntity';
export type SessionEntity = (BaseEntity & {
    /**
     * Human-readable session ID
     */
    display_id?: string;
    project_id?: string;
    project_name?: string;
    title?: string;
    description?: string;
    session_goal?: string;
    tags?: Array<string>;
    started_at?: string;
    /**
     * Session end time - null means active
     */
    ended_at?: string | null;
    /**
     * Decimal string of duration in minutes
     */
    duration_minutes?: string;
    last_activity_at?: string;
    last_context_at?: string;
    /**
     * Session status indicator
     */
    status?: string;
    session_type?: string;
    /**
     * Type of AI agent
     */
    agent_type?: string;
    /**
     * AI model used
     */
    ai_model?: string;
    lines_added?: number;
    lines_deleted?: number;
    lines_net?: number;
    files_modified_count?: number;
    tasks_created?: number;
    tasks_updated?: number;
    tasks_completed?: number;
    /**
     * Decimal string percentage
     */
    task_completion_rate?: string;
    contexts_created?: number;
    context_count?: number;
    /**
     * Input tokens consumed
     */
    input_tokens?: string;
    /**
     * Output tokens generated
     */
    output_tokens?: string;
    /**
     * Total tokens (input + output)
     */
    total_tokens?: string;
    /**
     * Decimal productivity score 0-100
     */
    productivity_score?: string;
    activity_count?: number;
    metadata?: Record<string, any>;
});

