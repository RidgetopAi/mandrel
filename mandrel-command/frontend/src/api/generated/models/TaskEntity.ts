/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseEntity } from './BaseEntity';
export type TaskEntity = (BaseEntity & {
    /**
     * Associated project ID
     */
    project_id: string;
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
    type: 'general' | 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'devops';
    /**
     * Task status
     */
    status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
    /**
     * Task priority
     */
    priority: 'low' | 'medium' | 'high' | 'urgent';
    /**
     * Assignee
     */
    assigned_to?: string;
    /**
     * Task tags
     */
    tags?: Array<string>;
    /**
     * Task due date
     */
    due_date?: string;
    /**
     * Estimated hours to complete
     */
    estimated_hours?: number;
    /**
     * Actual hours spent
     */
    actual_hours?: number;
});

