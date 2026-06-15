import { isValidUuid, UNASSIGNED_PROJECT_ID } from './uuid';

/**
 * Guard test for the customer-reported "Failed to Load Project Insights — Bad
 * Request". isValidUuid is the gate that stops the UI from calling UUID-validated
 * backend routes (insights/sessions/etc.) with an id that would 400.
 */
describe('isValidUuid', () => {
  test('accepts a real canonical UUID (any case)', () => {
    expect(isValidUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isValidUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  test('rejects the UNASSIGNED / nil sentinel', () => {
    // The backend Zod uuid() would ACCEPT this, so the frontend MUST reject it
    // — this is the load-bearing half of the Bug B fix.
    expect(isValidUuid(UNASSIGNED_PROJECT_ID)).toBe(false);
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  test('rejects synthetic aidis-<name> ids (the actual root cause)', () => {
    expect(isValidUuid('aidis-my-project')).toBe(false);
    expect(isValidUuid('aidis-personal-project')).toBe(false);
  });

  test('rejects undefined / null / non-string / empty / garbage', () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('undefined')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid(12345)).toBe(false);
    expect(isValidUuid({})).toBe(false);
  });
});
