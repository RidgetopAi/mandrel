/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiSuccessResponse } from '../models/ApiSuccessResponse';
import type { ContextBulkDelete } from '../models/ContextBulkDelete';
import type { ContextEntity } from '../models/ContextEntity';
import type { ContextSearchResponse } from '../models/ContextSearchResponse';
import type { ContextStats } from '../models/ContextStats';
import type { UpdateContext } from '../models/UpdateContext';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ContextsService {
    /**
     * Search contexts with filters
     * @returns any Contexts retrieved successfully
     * @throws ApiError
     */
    public static getContexts({
        query,
        projectId,
        sessionId,
        type,
        tags,
        limit = 20,
        offset,
    }: {
        /**
         * Free-text search query
         */
        query?: string,
        /**
         * Filter by project ID (falls back to X-Project-ID header)
         */
        projectId?: string,
        sessionId?: string,
        type?: 'code' | 'decision' | 'research' | 'issue' | 'note' | 'error' | 'test',
        /**
         * Comma-separated tags filter
         */
        tags?: string,
        limit?: number,
        offset?: number,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: ContextSearchResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/contexts',
            query: {
                'query': query,
                'project_id': projectId,
                'session_id': sessionId,
                'type': type,
                'tags': tags,
                'limit': limit,
                'offset': offset,
            },
        });
    }
    /**
     * Retrieve context statistics for the current project
     * @returns any Statistics returned
     * @throws ApiError
     */
    public static getContextsStats(): CancelablePromise<(ApiSuccessResponse & {
        data?: ContextStats;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/contexts/stats',
        });
    }
    /**
     * Perform semantic context search
     * @returns any Semantic search results
     * @throws ApiError
     */
    public static postContextsSearch({
        requestBody,
    }: {
        requestBody: UpdateContext,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: ContextSearchResponse;
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/contexts/search',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get a context by ID
     * @returns any Context retrieved
     * @throws ApiError
     */
    public static getContexts1({
        id,
    }: {
        id: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: ContextEntity;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/contexts/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Context not found`,
            },
        });
    }
    /**
     * Update an existing context
     * @returns any Context updated
     * @throws ApiError
     */
    public static putContexts({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: Record<string, any>,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: ContextEntity;
    })> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/contexts/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Context not found`,
            },
        });
    }
    /**
     * Delete a context
     * @returns any Context deleted successfully
     * @throws ApiError
     */
    public static deleteContexts({
        id,
    }: {
        id: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/contexts/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Context not found`,
            },
        });
    }
    /**
     * Bulk delete contexts by ID
     * @returns any Contexts deleted successfully
     * @throws ApiError
     */
    public static deleteContextsBulkDelete({
        requestBody,
    }: {
        requestBody: ContextBulkDelete,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/contexts/bulk/delete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get contexts related to the supplied context
     * @returns any Related contexts returned
     * @throws ApiError
     */
    public static getContextsRelated({
        id,
    }: {
        id: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: Array<ContextEntity>;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/contexts/{id}/related',
            path: {
                'id': id,
            },
        });
    }
}
