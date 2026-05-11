import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'aidis_isolation_test';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'test_user';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'test_pass';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.AIDIS_SKIP_DATABASE = 'true';
process.env.AIDIS_SKIP_BACKGROUND = 'true';
process.env.AIDIS_SKIP_STDIO = 'true';

const mocks = vi.hoisted(() => ({
  projectHandler: {
    initializeSession: vi.fn(),
    getCurrentProjectId: vi.fn(),
    getCurrentProject: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
  },
  switchProjectWithValidation: vi.fn(),
  contextHandler: {
    storeContext: vi.fn(),
  },
  sessionTracking: {
    trackContextStored: vi.fn(),
  },
}));

vi.mock('../handlers/project.js', () => ({
  projectHandler: mocks.projectHandler,
}));

vi.mock('../services/projectSwitchValidator.js', () => ({
  switchProjectWithValidation: mocks.switchProjectWithValidation,
}));

vi.mock('../handlers/context.js', () => ({
  contextHandler: mocks.contextHandler,
}));

vi.mock('../api/middleware/sessionTracking.js', () => ({
  SessionTrackingMiddleware: mocks.sessionTracking,
}));

describe('connection-scoped project isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes X-Connection-ID from the HTTP bridge into MCP tool execution context', async () => {
    const { HealthServer } = await import('../server/healthServer.js');
    const executor = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const healthServer = new HealthServer(executor, args => args);

    const req = {
      params: { toolName: 'project_current' },
      body: { arguments: {} },
      header: (name: string) => (name === 'X-Connection-ID' ? 'client-a' : undefined),
    };
    const res: any = {
      status: vi.fn(() => res),
      json: vi.fn(),
    };

    await (healthServer as any).handleMcpToolExpress(req, res);

    expect(executor).toHaveBeenCalledWith('project_current', {}, { connectionId: 'client-a' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      result: { content: [{ type: 'text', text: 'ok' }] },
    });
  });

  it('uses a named shared HTTP fallback when the connection header is absent', async () => {
    const { HealthServer } = await import('../server/healthServer.js');
    const executor = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const healthServer = new HealthServer(executor, args => args);

    const req = {
      params: { toolName: 'project_current' },
      body: { arguments: {} },
      header: () => undefined,
    };
    const res: any = {
      status: vi.fn(() => res),
      json: vi.fn(),
    };

    await (healthServer as any).handleMcpToolExpress(req, res);

    expect(executor).toHaveBeenCalledWith('project_current', {}, { connectionId: 'http-default' });
  });

  it('routes project switches through separate session IDs per connection', async () => {
    const { routeExecutor } = await import('../routes/index.js');
    mocks.switchProjectWithValidation.mockImplementation(async (project: string) => ({
      id: `${project}-id`,
      name: project,
      description: null,
      status: 'active',
      contextCount: 0,
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
    }));

    await routeExecutor('project_switch', { project: 'mandrel-stab' }, { connectionId: 'client-a' });
    await routeExecutor('project_switch', { project: 'squire-agent' }, { connectionId: 'client-b' });

    expect(mocks.switchProjectWithValidation).toHaveBeenNthCalledWith(1, 'mandrel-stab', 'client-a');
    expect(mocks.switchProjectWithValidation).toHaveBeenNthCalledWith(2, 'squire-agent', 'client-b');
  });

  it('resolves implicit context_store project from the calling connection', async () => {
    const { routeExecutor } = await import('../routes/index.js');

    mocks.projectHandler.initializeSession.mockResolvedValue(null);
    mocks.projectHandler.getCurrentProjectId.mockImplementation(async (sessionId: string) => {
      if (sessionId === 'client-a') return 'project-a';
      if (sessionId === 'client-b') return 'project-b';
      return null;
    });
    mocks.contextHandler.storeContext.mockImplementation(async (input: any) => ({
      id: `ctx-${input.projectId}`,
      contextType: input.type,
      relevanceScore: 5,
      tags: input.tags || [],
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
      content: input.content,
    }));

    await routeExecutor(
      'context_store',
      { content: 'client A memory', type: 'completion' },
      { connectionId: 'client-a' },
    );
    await routeExecutor(
      'context_store',
      { content: 'client B memory', type: 'completion' },
      { connectionId: 'client-b' },
    );

    expect(mocks.contextHandler.storeContext).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ projectId: 'project-a', content: 'client A memory' }),
    );
    expect(mocks.contextHandler.storeContext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ projectId: 'project-b', content: 'client B memory' }),
    );
  });
});
