/**
 * Mandrel Session Integration
 * Queries Mandrel API for current active session
 * Phase 2.1 - Foundation
 * Task: TS-030-2-1
 *
 * Purpose:
 * - Link new spindles to actual Mandrel development sessions
 * - Enable correlation of thinking patterns to development outcomes
 */

const MANDREL_BASE_URL = process.env.MANDREL_URL || 'http://localhost:3001';
const LEGACY_SESSION_ID = '00000000-0000-0000-0000-000000000001';

export interface MandrelSession {
  id: string;
  title?: string;
  status: string;
  started_at: string;
  last_activity_at?: string;
}

/**
 * Get current active Mandrel session
 */
export async function getCurrentSession(): Promise<string | null> {
  try {
    // Query Mandrel for active sessions
    const response = await fetch(`${MANDREL_BASE_URL}/api/v2/sessions?status=active&limit=1`);

    if (!response.ok) {
      console.warn(`Mandrel API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    // Return first active session ID
    if (data.sessions && data.sessions.length > 0) {
      return data.sessions[0].id;
    }

    return null;
  } catch (err) {
    console.warn('Failed to fetch current Mandrel session:', err);
    return null;
  }
}

/**
 * Get session ID with fallback strategy
 * Priority:
 * 1. Try to get current active Mandrel session
 * 2. Fall back to legacy session if Mandrel unavailable
 */
export async function getSessionWithFallback(): Promise<string> {
  const currentSession = await getCurrentSession();

  if (currentSession) {
    console.log(`Using Mandrel session: ${currentSession}`);
    return currentSession;
  }

  console.log('Using legacy session (Mandrel unavailable)');
  return LEGACY_SESSION_ID;
}

/**
 * Create new session in Mandrel (optional - for future use)
 */
export async function createSession(title: string): Promise<string | null> {
  try {
    const response = await fetch(`${MANDREL_BASE_URL}/api/v2/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        agent_type: 'general-purpose',
        status: 'active',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.session?.id || null;
  } catch (err) {
    console.warn('Failed to create Mandrel session:', err);
    return null;
  }
}
