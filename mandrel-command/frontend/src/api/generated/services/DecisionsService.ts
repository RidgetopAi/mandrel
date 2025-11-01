/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiSuccessResponse } from '../models/ApiSuccessResponse';
import type { CreateDecisionRequest } from '../models/CreateDecisionRequest';
import type { DecisionEntity } from '../models/DecisionEntity';
import type { DecisionSearchResponse } from '../models/DecisionSearchResponse';
import type { DecisionStats } from '../models/DecisionStats';
import type { UpdateDecisionRequest } from '../models/UpdateDecisionRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DecisionsService {
    /**
     * Search technical decisions
     * @returns any Decisions retrieved
     * @throws ApiError
     */
    public static getDecisions({
        query,
        status,
        projectId,
        createdBy,
        dateFrom,
        dateTo,
        limit = 20,
        offset,
    }: {
        /**
         * Free-text search term to locate decisions
         */
        query?: string,
        /**
         * Filter decisions by lifecycle status
         */
        status?: 'active' | 'under_review' | 'superseded' | 'deprecated',
        /**
         * Scope search to a specific project
         */
        projectId?: string,
        /**
         * Filter by author username
         */
        createdBy?: string,
        /**
         * Inclusive lower bound for creation date
         */
        dateFrom?: string,
        /**
         * Inclusive upper bound for creation date
         */
        dateTo?: string,
        limit?: number,
        offset?: number,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: DecisionSearchResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/decisions',
            query: {
                'query': query,
                'status': status,
                'project_id': projectId,
                'created_by': createdBy,
                'date_from': dateFrom,
                'date_to': dateTo,
                'limit': limit,
                'offset': offset,
            },
        });
    }
    /**
     * Record a new technical decision
     * @returns any Decision recorded successfully
     * @throws ApiError
     */
    public static postDecisions({
        requestBody,
    }: {
        requestBody: CreateDecisionRequest,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/decisions',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Retrieve decision statistics
     * @returns any Statistics returned
     * @throws ApiError
     */
    public static getDecisionsStats({
        projectId,
    }: {
        /**
         * Optional project scope for statistics
         */
        projectId?: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: DecisionStats;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/decisions/stats',
            query: {
                'project_id': projectId,
            },
        });
    }
    /**
     * Get a decision by ID
     * @returns any Decision retrieved
     * @throws ApiError
     */
    public static getDecisions1({
        id,
    }: {
        id: string,
    }): CancelablePromise<(ApiSuccessResponse & {
        data?: DecisionEntity;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/decisions/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Decision not found`,
            },
        });
    }
    /**
     * Update a decision
     * @returns any Decision updated successfully
     * @throws ApiError
     */
    public static putDecisions({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateDecisionRequest,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/decisions/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a decision
     * @returns any Decision deleted successfully
     * @throws ApiError
     */
    public static deleteDecisions({
        id,
    }: {
        id: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/decisions/{id}',
            path: {
                'id': id,
            },
        });
    }
}
