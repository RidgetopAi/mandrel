/**
 * Surveyor service CLIENT — contract + robustness tests (Surveyor P4b, task 8ed9e216).
 *
 * Tests are armor. This drives the REAL SurveyorClient through a FAITHFUL FAKE fetch that
 * reproduces the real P4a job-API wire shapes (POST 202 → poll running→done → GET result
 * WRAPPED as { result }), pinning:
 *   (1) the full flow resolves to the UNWRAPPED ScanResult (the `.result` unwrap is the
 *       single most important contract detail),
 *   (2) bearer auth is sent (the fake 401s without it),
 *   (3) polling waits through 'running' before fetching the result,
 *   (4) every failure mode maps to a typed SurveyorClientError.kind:
 *       not_configured (no token), service_down (network throw), job_error (status error),
 *       timeout (poll ceiling), bad_response (missing .result).
 *
 * DB-free + offline + no real delay (sleep injected as a no-op).
 */

import { describe, test, expect } from 'vitest';
import { SurveyorClient, SurveyorClientError } from '../services/surveyorClient.js';
import type { SurveyorConfig } from '../config/surveyorConfig.js';
import { makeFakeFetch, makeScanResult } from './surveyorFixtures.js';

const baseConfig: SurveyorConfig = {
  baseUrl: 'http://surveyor.test',
  authToken: 'test-token',
  pollIntervalMs: 1,
  pollTimeoutMs: 10_000,
  requestTimeoutMs: 5_000,
  findings: { defaultMinConfidence: 0, defaultLimit: 500, maxLimit: 5000 },
};

const noSleep = async () => {};

describe('SurveyorClient (P4b service client contract)', () => {
  test('drives POST → poll → result and UNWRAPS .result to the ScanResult', async () => {
    const expected = makeScanResult();
    const client = new SurveyorClient({
      config: baseConfig,
      fetchImpl: makeFakeFetch({ result: expected, runningPolls: 2 }),
      sleep: noSleep,
    });

    const result = await client.scan('/srv/code/demo');

    // The returned value is the ScanResult itself — NOT the { result: ... } wrapper.
    expect((result as any).result).toBeUndefined();
    expect(result.id).toBe(expected.id);
    expect(result.projectName).toBe('demo');
    expect(Object.keys(result.nodes)).toContain('fn:handleRequest');
    expect(result.connections).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.stats.totalFunctions).toBe(2);
  });

  test('sends a Bearer auth header (fake 401s without it → http path)', async () => {
    // A client whose config has a token, but we strip it via a fetch that checks auth: the
    // faithful fake already 401s on a missing Bearer; here we prove a GOOD token passes.
    const client = new SurveyorClient({
      config: baseConfig,
      fetchImpl: makeFakeFetch({ runningPolls: 0 }),
      sleep: noSleep,
    });
    const result = await client.scan('/srv/code/demo');
    expect(result.id).toBe('scan-fixture-0001');
  });

  test('fail-closed: no auth token → not_configured (no network call attempted)', async () => {
    let called = false;
    const client = new SurveyorClient({
      config: { ...baseConfig, authToken: '' },
      fetchImpl: (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      sleep: noSleep,
    });
    await expect(client.scan('/x')).rejects.toMatchObject({ kind: 'not_configured' });
    expect(called).toBe(false);
  });

  test('network failure → service_down', async () => {
    const client = new SurveyorClient({
      config: baseConfig,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
      sleep: noSleep,
    });
    const err = await client.scan('/x').catch((e) => e);
    expect(err).toBeInstanceOf(SurveyorClientError);
    expect(err.kind).toBe('service_down');
  });

  test('an AbortError (request timeout) → timeout', async () => {
    const client = new SurveyorClient({
      config: baseConfig,
      fetchImpl: (async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      }) as unknown as typeof fetch,
      sleep: noSleep,
    });
    const err = await client.scan('/x').catch((e) => e);
    expect(err.kind).toBe('timeout');
  });

  test('job reports error during polling → job_error (carries the message)', async () => {
    const client = new SurveyorClient({
      config: baseConfig,
      fetchImpl: makeFakeFetch({ jobError: 'parser crashed' }),
      sleep: noSleep,
    });
    const err = await client.scan('/x').catch((e) => e);
    expect(err.kind).toBe('job_error');
    expect(err.message).toContain('parser crashed');
  });

  test('poll ceiling elapses before done → timeout', async () => {
    // pollTimeoutMs 0 → after the first 'running' status, the deadline has passed.
    const client = new SurveyorClient({
      config: { ...baseConfig, pollTimeoutMs: 0 },
      fetchImpl: makeFakeFetch({ runningPolls: 99 }), // never reaches done
      sleep: noSleep,
    });
    const err = await client.scan('/x').catch((e) => e);
    expect(err.kind).toBe('timeout');
  });

  test('result body missing .result → bad_response (the unwrap is validated)', async () => {
    const fetchImpl = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = { 'Content-Type': 'application/json' };
      if (method === 'POST') return new Response(JSON.stringify({ jobId: 'j', status: 'queued' }), { status: 202, headers });
      if (/\/result$/.test(url)) return new Response(JSON.stringify({ notResult: {} }), { status: 200, headers });
      return new Response(JSON.stringify({ jobId: 'j', status: 'done' }), { status: 200, headers });
    }) as unknown as typeof fetch;
    const client = new SurveyorClient({ config: baseConfig, fetchImpl, sleep: noSleep });
    const err = await client.scan('/x').catch((e) => e);
    expect(err.kind).toBe('bad_response');
  });
});
