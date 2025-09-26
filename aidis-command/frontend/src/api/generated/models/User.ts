/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type User = {
    /**
     * Unique user identifier
     */
    id: string;
    /**
     * Unique username
     */
    username: string;
    /**
     * User email address
     */
    email: string;
    /**
     * User role
     */
    role: 'admin' | 'user';
    /**
     * Whether the user account is active
     */
    is_active: boolean;
    /**
     * Account creation timestamp
     */
    created_at: string;
    /**
     * Last update timestamp
     */
    updated_at: string;
    /**
     * Last login timestamp
     */
    last_login?: string;
};

