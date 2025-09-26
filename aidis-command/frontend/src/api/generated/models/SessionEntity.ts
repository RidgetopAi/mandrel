/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseEntity } from './BaseEntity';
export type SessionEntity = (BaseEntity & {
    project_id?: string;
    project_name?: string;
    title?: string;
    description?: string;
    context_count?: number;
    last_context_at?: string;
    session_type?: string;
    /**
     * Session status indicator
     */
    status?: string;
});

