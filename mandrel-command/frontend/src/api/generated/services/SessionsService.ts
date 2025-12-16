/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiSuccessResponse } from '../models/ApiSuccessResponse';
import type { SessionAssignmentResponse } from '../models/SessionAssignmentResponse';
import type { SessionCurrentResponse } from '../models/SessionCurrentResponse';
import type { SessionDetailResponse } from '../models/SessionDetailResponse';
import type { SessionEntity } from '../models/SessionEntity';
import type { SessionListResponse } from '../models/SessionListResponse';
import type { SessionStats } from '../models/SessionStats';
import type { UpdateSession } from '../models/UpdateSession';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SessionsService {
    /**
     * Retrieve the currently active session from MCP
     * @returns any Current session information or null
     * @throws ApiError
     */
    public static getSessionsCurrent(): CancelablePromise<(ApiSuccessResponse & {
        data?: SessionCurrentResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sessions/current',
        });
    }
    /**
     * Retrieve session statistics
     * @returns any Statistics returned
     * @throws ApiError
     */
    public static getSessionsStats({
        projectId,
    }: {
        projectId?: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: SessionStats;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sessions/stats',
            query: {
                'project_id': projectId,
            },
        });
    }
    /**
     * List sessions with optional filters
     * @returns any Sessions returned
     * @throws ApiError
     */
    public static getSessions({
        projectId,
        status,
    }: {
        projectId?: string,
        status?: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: SessionListResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sessions',
            query: {
                'project_id': projectId,
                'status': status,
            },
        });
    }
    /**
     * Assign the current session to the specified project
     * @returns any Session assignment result
     * @throws ApiError
     */
    public static postSessionsAssign({
        requestBody,
    }: {
        requestBody: {
            projectName: string;
        },
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: SessionAssignmentResponse;
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/sessions/assign',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                501: `Endpoint temporarily disabled`,
            },
        });
    }
    /**
     * Update session metadata
     * @returns any Session updated successfully
     * @throws ApiError
     */
    public static putSessions({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateSession,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: {
            session?: SessionEntity;
        };
    })> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/sessions/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid session data`,
                404: `Session not found`,
            },
        });
    }
    /**
     * Get detailed session information
     * @returns any Detailed session returned
     * @throws ApiError
     */
    public static getSessions1({
        id,
    }: {
        id: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: SessionDetailResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sessions/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Session not found`,
            },
        });
    }
}
