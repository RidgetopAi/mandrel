/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateTaskRequest = {
    /**
     * Task title
     */
    title?: string;
    /**
     * Task description
     */
    description?: string;
    /**
     * Task type
     */
    type?: 'general' | 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'devops';
    /**
     * Task status
     */
    status?: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
    /**
     * Task priority
     */
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    /**
     * Assignee
     */
    assigned_to?: string;
    /**
     * Task tags
     */
    tags?: Array<string>;
};

