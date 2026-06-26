/**
 * Task 10669bdd (minor bug #3) — getAllSessions honors its query params.
 *
 * THE BUG:
 *   The controller took `_req` and called `ProjectService.getAllSessions()`
 *   with no arguments, ignoring the `limit` and `project_id` the dashboard
 *   widget sends. The UI believed it was filtering but received every session.
 *
 * THE FIX:
 *   The controller parses `project_id` (must be a valid UUID) and `limit`
 *   (positive int) and forwards them to the service.
 *
 * This test mocks the service layer (no DB) and asserts the controller forwards
 * exactly the right, validated options.
 */
import request from 'supertest';
import express from 'express';

// Mock the service so we can assert what the controller passes it.
const getAllSessionsMock = jest.fn().mockResolvedValue([]);
jest.mock('../services/project', () => ({
  ProjectService: {
    getAllSessions: (...args: unknown[]) => getAllSessionsMock(...args),
  },
}));

// Avoid pulling the DB/logger config chain unnecessarily.
jest.mock('../config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { ProjectController } from '../controllers/project';

const app = express();
app.get('/projects/sessions/all', ProjectController.getAllSessions);

const VALID_UUID = 'c875b2af-9020-41b7-9595-d70221603464';

beforeEach(() => {
  getAllSessionsMock.mockClear();
});

describe('GET /projects/sessions/all — param handling', () => {
  test('forwards a valid project_id and limit', async () => {
    await request(app)
      .get(`/projects/sessions/all?project_id=${VALID_UUID}&limit=10`)
      .expect(200);

    expect(getAllSessionsMock).toHaveBeenCalledWith({
      projectId: VALID_UUID,
      limit: 10,
    });
  });

  test('drops an INVALID (non-UUID) project_id rather than passing it through', async () => {
    await request(app)
      .get('/projects/sessions/all?project_id=session_voiceitt-bridge&limit=5')
      .expect(200);

    expect(getAllSessionsMock).toHaveBeenCalledWith({
      projectId: undefined,
      limit: 5,
    });
  });

  test('ignores a non-positive / non-numeric limit', async () => {
    await request(app)
      .get('/projects/sessions/all?limit=-3')
      .expect(200);
    expect(getAllSessionsMock).toHaveBeenCalledWith({
      projectId: undefined,
      limit: undefined,
    });

    getAllSessionsMock.mockClear();
    await request(app).get('/projects/sessions/all?limit=abc').expect(200);
    expect(getAllSessionsMock).toHaveBeenCalledWith({
      projectId: undefined,
      limit: undefined,
    });
  });

  test('no params → no filters', async () => {
    await request(app).get('/projects/sessions/all').expect(200);
    expect(getAllSessionsMock).toHaveBeenCalledWith({
      projectId: undefined,
      limit: undefined,
    });
  });
});
