/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateTaskRequest = {
    /**
     * Task title
     */
    title: string;
    /**
     * Task description
     */
    description?: string;
    /**
     * Task type
     */
    type?: 'general' | 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'devops';
    /**
     * Task priority
     */
    priority: 'low' | 'medium' | 'high' | 'urgent';
    /**
     * Assignee
     */
    assigned_to?: string;
    /**
     * Associated project ID
     */
    project_id: string;
    /**
     * Task tags
     */
    tags?: Array<string>;
};

