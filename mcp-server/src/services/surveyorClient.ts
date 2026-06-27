/**
 * Surveyor service CLIENT (Surveyor P4b integration, Mandrel task 8ed9e216, decision 8f330f96).
 *
 * The single home for talking to the shared Surveyor service (P4a, @surveyor/server). The
 * job API is async:
 *
 *   POST /api/v1/scans            -> 202 { jobId, status: 'queued' }   (starts the scan)
 *   GET  /api/v1/scans/:jobId     -> { jobId, status, progress, error? }  (poll for terminal)
 *   GET  /api/v1/scans/:jobId/result -> 200 { result: ScanResult }   ← WRAPPED; unwrap .result
 *
 * scan() drives the whole flow: POST → poll status until 'done'|'error' → GET result →
 * UNWRAP `.result` → return the ScanResult. Bearer auth on every request (config token);
 * per-request timeout (AbortController) so a hung socket can't wedge a tool; an overall poll
 * timeout so a stuck job is surfaced, not waited-on forever.
 *
 * configs-not-hardcoded: base URL / token / poll interval / poll timeout / request timeout
 * all come from SURVEYOR_CONFIG (config/surveyorConfig.ts) — nothing is a literal here.
 *
 * FAIL-CLOSED: with no auth token configured, the client refuses to call (NotConfigured) —
 * the same posture the service's bearerAuth uses on its side.
 *
 * TESTABILITY: `fetchImpl` and `sleep` are injectable (default: global fetch + a real timer),
 * so the contract tests drive the REAL flow with a faithful fake fetch that returns the real
 * job-API wire shapes (incl. the wrapped result) with zero network + zero real delay.
 */

import { SURVEYOR_CONFIG, type SurveyorConfig } from '../config/surveyorConfig.js';
import { logger } from '../utils/logger.js';
import type {
  SurveyorScanResult,
  SurveyorCreateScanResponse,
  SurveyorJobStatusResponse,
  SurveyorResultResponse,
} from '../types/surveyor.js';

/** The kinds of failure a Surveyor call can hit (drives actionable error text + tests). */
export type SurveyorErrorKind =
  | 'not_configured' // no auth token / base URL — fail closed before any call
  | 'service_down' // network error / connection refused / DNS — couldn't reach the service
  | 'http_error' // the service returned a non-2xx we don't otherwise classify
  | 'job_error' // the scan job itself failed (status:'error')
  | 'timeout' // the poll ceiling elapsed before the job reached a terminal state
  | 'bad_response'; // a 2xx whose body wasn't the shape the contract promises

export class SurveyorClientError extends Error {
  constructor(
    public readonly kind: SurveyorErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SurveyorClientError';
  }
}

/** Options forwarded to the service's scan job (ScanRunOptions on the P4a side). */
export interface SurveyorScanOptions {
  skipAnalysis?: boolean;
  detect?: boolean;
  mode?: 'app' | 'library';
}

/** The client contract — so tools can depend on an interface (and be faked in tests). */
export interface ISurveyorClient {
  scan(projectPath: string, options?: SurveyorScanOptions): Promise<SurveyorScanResult>;
}

/** Injectable collaborators (defaults: global fetch + a real setTimeout). */
export interface SurveyorClientDeps {
  config?: SurveyorConfig;
  fetchImpl?: typeof fetch;
  /** Resolve after `ms` — injectable so tests don't wait real time. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class SurveyorClient implements ISurveyorClient {
  private readonly config: SurveyorConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: SurveyorClientDeps = {}) {
    this.config = deps.config ?? SURVEYOR_CONFIG;
    // Bind to globalThis so the default fetch keeps its correct receiver.
    this.fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.sleep = deps.sleep ?? realSleep;
  }

  /** Build the auth header set; fail closed if no token is configured. */
  private authHeaders(): Record<string, string> {
    if (!this.config.authToken) {
      throw new SurveyorClientError(
        'not_configured',
        'Surveyor service is not configured: SURVEYOR_AUTH_TOKEN is unset. ' +
          'Set it (and SURVEYOR_BASE_URL) in the environment before scanning.',
      );
    }
    return {
      Authorization: `Bearer ${this.config.authToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * One HTTP request with a per-request timeout (AbortController). Classifies a network
   * failure as `service_down` and an abort as `timeout`; returns the raw Response otherwise
   * (status checking is the caller's job, since 202/409/500 each mean something specific).
   */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SurveyorClientError(
          'timeout',
          `Surveyor request timed out after ${this.config.requestTimeoutMs}ms (${path}).`,
          err,
        );
      }
      throw new SurveyorClientError(
        'service_down',
        `Could not reach the Surveyor service at ${this.config.baseUrl} (${path}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Parse a JSON body, classifying a non-JSON 2xx as bad_response. */
  private async parseJson<T>(resp: Response, path: string): Promise<T> {
    try {
      return (await resp.json()) as T;
    } catch (err) {
      throw new SurveyorClientError(
        'bad_response',
        `Surveyor returned a non-JSON body for ${path} (status ${resp.status}).`,
        err,
      );
    }
  }

  /** Best-effort extraction of a service error message from a response body. */
  private async errorText(resp: Response): Promise<string> {
    try {
      const body = (await resp.json()) as { error?: string };
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      /* fall through to status text */
    }
    return resp.statusText || `HTTP ${resp.status}`;
  }

  /**
   * Drive a full scan: create the job, poll to a terminal state, fetch + UNWRAP the result.
   * Throws a SurveyorClientError (with a `kind`) on any failure; otherwise resolves to the
   * ScanResult.
   */
  async scan(projectPath: string, options?: SurveyorScanOptions): Promise<SurveyorScanResult> {
    const headers = this.authHeaders(); // fail-closed before any network

    // 1) POST /api/v1/scans → 202 { jobId, status }
    const createResp = await this.request('/api/v1/scans', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectPath, ...(options ? { options } : {}) }),
    });
    if (createResp.status === 401) {
      throw new SurveyorClientError('not_configured', 'Surveyor rejected the auth token (401 Unauthorized).');
    }
    if (createResp.status !== 202) {
      throw new SurveyorClientError(
        'http_error',
        `Surveyor failed to start the scan (HTTP ${createResp.status}): ${await this.errorText(createResp)}`,
      );
    }
    const created = await this.parseJson<SurveyorCreateScanResponse>(createResp, 'POST /api/v1/scans');
    if (!created?.jobId) {
      throw new SurveyorClientError('bad_response', 'Surveyor create-scan response had no jobId.');
    }
    const jobId = created.jobId;
    logger.info(`🛰️  Surveyor scan started (job ${jobId}) for ${projectPath}`);

    // 2) Poll GET /api/v1/scans/:jobId until status is terminal ('done' | 'error').
    const deadline = Date.now() + this.config.pollTimeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const statusResp = await this.request(`/api/v1/scans/${jobId}`, { method: 'GET', headers });
      if (statusResp.status === 404) {
        throw new SurveyorClientError('job_error', `Surveyor lost job ${jobId} (404 Not Found) before it completed.`);
      }
      if (!statusResp.ok) {
        throw new SurveyorClientError(
          'http_error',
          `Surveyor status poll failed (HTTP ${statusResp.status}): ${await this.errorText(statusResp)}`,
        );
      }
      const status = await this.parseJson<SurveyorJobStatusResponse>(statusResp, `GET /api/v1/scans/${jobId}`);

      if (status.status === 'error') {
        throw new SurveyorClientError('job_error', `Surveyor scan failed: ${status.error ?? 'unknown job error'}`);
      }
      if (status.status === 'done') break;

      if (Date.now() >= deadline) {
        throw new SurveyorClientError(
          'timeout',
          `Surveyor scan did not finish within ${this.config.pollTimeoutMs}ms (job ${jobId}, last status '${status.status}').`,
        );
      }
      await this.sleep(this.config.pollIntervalMs);
    }

    // 3) GET /api/v1/scans/:jobId/result → 200 { result: ScanResult } — UNWRAP `.result`.
    const resultResp = await this.request(`/api/v1/scans/${jobId}/result`, { method: 'GET', headers });
    if (resultResp.status === 500) {
      throw new SurveyorClientError('job_error', `Surveyor scan failed: ${await this.errorText(resultResp)}`);
    }
    if (!resultResp.ok) {
      throw new SurveyorClientError(
        'http_error',
        `Surveyor result fetch failed (HTTP ${resultResp.status}): ${await this.errorText(resultResp)}`,
      );
    }
    const wrapped = await this.parseJson<SurveyorResultResponse>(resultResp, `GET /api/v1/scans/${jobId}/result`);
    if (!wrapped || typeof wrapped !== 'object' || !wrapped.result || typeof wrapped.result !== 'object') {
      throw new SurveyorClientError(
        'bad_response',
        'Surveyor result response was not the expected { result: ScanResult } shape.',
      );
    }
    // THE UNWRAP: the endpoint returns { result }, the rest of Mandrel works with ScanResult.
    return wrapped.result;
  }
}

/** Default singleton (reads SURVEYOR_CONFIG). Tools import this; tests inject their own. */
export const surveyorClient = new SurveyorClient();
