import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';
import { isValidUuid, clearStoredProject } from '../utils/uuid';

// Legacy auth interfaces removed - use generated types from src/api/generated/models/

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

class ApiClient {
  private _instance: AxiosInstance;
  
  get instance(): AxiosInstance {
    return this._instance;
  }

  constructor() {
    const baseURL =
      process.env.REACT_APP_API_URL ||
      process.env.REACT_APP_API_BASE_URL ||
      '/api';

    this._instance = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token and project ID
    this._instance.interceptors.request.use(
      (config) => {
        // Add auth token
        const token = localStorage.getItem('aidis_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add X-Project-ID header if currentProject exists and not already
        // specified. SELF-HEAL: this interceptor reads localStorage independently
        // of ProjectContext, so it must apply the SAME UUID validation. Only a
        // real-UUID id is attached; a corrupt/synthetic/UNASSIGNED id is never
        // sent AND the offending stored keys are purged so the dashboard heals
        // without the user clearing site data.
        if (!config.headers['X-Project-ID']) {
          try {
            const currentProjectData = localStorage.getItem('aidis_selected_project');
            if (currentProjectData) {
              const currentProject = JSON.parse(currentProjectData);
              if (isValidUuid(currentProject?.id)) {
                config.headers['X-Project-ID'] = currentProject.id;
              } else {
                // Corrupt or sentinel id — discard the stored project entirely.
                clearStoredProject();
              }
            }
          } catch (error) {
            // Unparseable stored value — treat as corrupt and purge it.
            clearStoredProject();
          }
        }
        
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this._instance.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('API Response Error:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('aidis_token');
          localStorage.removeItem('aidis_user');
          window.location.href = '/login';
        }
        
        return Promise.reject({
          message: error.response?.data?.message || error.message,
          code: error.response?.data?.code,
          details: error.response?.data,
        } as ApiError);
      }
    );
  }

  // Legacy authentication methods removed - use generated AuthenticationService instead
  // See: src/hooks/useAuth.ts for React Query auth hooks

  // Generic HTTP methods
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._instance.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._instance.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._instance.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._instance.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._instance.delete<T>(url, config);
    return response.data;
  }

  // Health check
  async ping(): Promise<{ message: string; timestamp: string }> {
    const response = await this._instance.get<{ message: string; timestamp: string }>('/health');
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export const apiService = apiClient;  // Alias for compatibility
export default apiClient;
