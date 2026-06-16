/**
 * QA Finding #2: React Query Integration with Generated OpenAPI Client
 * Configures the generated OpenAPI client for React Query usage
 */

import { OpenAPI } from './generated';
import { logger } from '../utils/logger';
import { isValidUuid, clearStoredProject } from '../utils/uuid';

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
  };

  try {
    const storedProject =
      localStorage.getItem('aidis_selected_project') ||
      localStorage.getItem('aidis_current_project');

    if (storedProject) {
      const parsed = JSON.parse(storedProject) as { id?: string } | null;
      // SELF-HEAL: this OpenAPI client reads localStorage independently of
      // ProjectContext, so it must apply the SAME UUID validation as
      // services/api.ts. Only a real-UUID id is attached; a corrupt/synthetic/
      // UNASSIGNED id (e.g. `session_voiceitt-bridge`) is NEVER sent — sending
      // it would make the backend project middleware 400 EVERY /api call and
      // wedge the dashboard. On corruption we purge the stored project keys so
      // the next load is clean (no manual site-data clearing by the user).
      if (isValidUuid(parsed?.id)) {
        headers['X-Project-ID'] = parsed!.id as string;
      } else {
        clearStoredProject();
      }
    }
  } catch (error) {
    logger.warn('Failed to attach project header for OpenAPI client:', error);
    // Unparseable stored value — treat as corrupt and purge it so it can't
    // re-wedge subsequent requests.
    clearStoredProject();
  }

  return headers;
};

// Export configured client
export { OpenAPI };
export * from './generated';
