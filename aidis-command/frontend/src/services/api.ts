import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  expires: string;
}

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
    this._instance = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
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

        // Add X-Project-ID header if currentProject exists and not already specified
        if (!config.headers['X-Project-ID']) {
          try {
            const currentProjectData = localStorage.getItem('aidis_selected_project');
            if (currentProjectData) {
              const currentProject = JSON.parse(currentProjectData);
              if (currentProject?.id) {
                config.headers['X-Project-ID'] = currentProject.id;
              }
            }
          } catch (error) {
            // Ignore localStorage parsing errors silently
          }
        }
        
        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this._instance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Response Error:', error.response?.data || error.message);
        
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

  // Authentication endpoints
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this._instance.post<LoginResponse>('/auth/login', credentials);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this._instance.post('/auth/logout');
    } finally {
      localStorage.removeItem('aidis_token');
      localStorage.removeItem('aidis_user');
    }
  }

  async refreshToken(): Promise<{ token: string; expires: string }> {
    const response = await this._instance.post<{ token: string; expires: string }>('/auth/refresh');
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this._instance.get<{ success: boolean; data: { user: User } }>('/auth/profile');
    return response.data.data.user;
  }

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
