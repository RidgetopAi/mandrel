import { SessionsService, type ApiSuccessResponse } from './generated';
import type { Session, SessionDetail, UpdateSessionRequest } from '../types/session';
import type { SessionAssignmentResponse } from './generated/models/SessionAssignmentResponse';
import type { SessionCurrentResponse } from './generated/models/SessionCurrentResponse';
import type { SessionDetailResponse } from './generated/models/SessionDetailResponse';
import type { UpdateSession } from './generated/models/UpdateSession';

const ensureSuccess = <T extends ApiSuccessResponse>(response: T, failureMessage: string): T => {
  if (!response.success) {
    throw new Error(failureMessage);
  }
  return response;
};

export const sessionsClient = {
  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const raw = await SessionsService.getSessions1({ id: sessionId }) as ApiSuccessResponse & {
      data?: SessionDetailResponse;
    };

    const response = ensureSuccess(raw, 'Failed to fetch session detail');
    const session = response.data?.session;

    if (!session) {
      throw new Error('Session detail payload missing in response');
    }

    return session as SessionDetail;
  },

  async getCurrentSession(): Promise<Session | null> {
    const raw = await SessionsService.getSessionsCurrent() as ApiSuccessResponse & {
      data?: SessionCurrentResponse;
    };

    const response = ensureSuccess(raw, 'Failed to fetch current session');
    return (response.data?.session ?? null) as Session | null;
  },

  async updateSession(sessionId: string, updates: UpdateSessionRequest): Promise<Session> {
    const response = ensureSuccess(
      await SessionsService.putSessions({
        id: sessionId,
        requestBody: updates as UpdateSession,
      }) as ApiSuccessResponse & { data?: { session?: Session } },
      'Failed to update session'
    );

    const session = response.data?.session;
    if (!session) {
      throw new Error('Session update payload missing in response');
    }

    return session;
  },

  async assignSession(projectName: string): Promise<SessionAssignmentResponse> {
    const raw = await SessionsService.postSessionsAssign({
      requestBody: { projectName },
    }) as ApiSuccessResponse & { data?: SessionAssignmentResponse };

    const response = ensureSuccess(raw, 'Failed to assign session');

    if (!response.data) {
      throw new Error('Session assignment payload missing in response');
    }

    return response.data;
  },
};

export default sessionsClient;
