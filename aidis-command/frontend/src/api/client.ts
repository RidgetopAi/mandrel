/**
 * QA Finding #2: React Query Integration with Generated OpenAPI Client
 * Configures the generated OpenAPI client for React Query usage
 */

import { OpenAPI } from './generated';

const resolvedBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  '/api';

// Configure the generated OpenAPI client
OpenAPI.BASE = resolvedBase;
OpenAPI.WITH_CREDENTIALS = false;
OpenAPI.CREDENTIALS = 'include';

// Add authorization header if we have a token
OpenAPI.TOKEN = async () => {
  const token = localStorage.getItem('aidis_token');
  return token || '';
};

// Add headers including correlation ID
OpenAPI.HEADERS = async () => {
  const headers: Record<string, string> = {
    'X-Correlation-ID': crypto.randomUUID(),
    'Content-Type': 'application/json',
  };

  try {
    const storedProject =
      localStorage.getItem('aidis_selected_project') ||
      localStorage.getItem('aidis_current_project');

    if (storedProject) {
      const parsed = JSON.parse(storedProject) as { id?: string } | null;
      if (parsed?.id && parsed.id !== '00000000-0000-0000-0000-000000000000') {
        headers['X-Project-ID'] = parsed.id;
      }
    }
  } catch (error) {
    console.warn('Failed to attach project header for OpenAPI client:', error);
  }

  return headers;
};

// Export configured client
export { OpenAPI };
export * from './generated';
