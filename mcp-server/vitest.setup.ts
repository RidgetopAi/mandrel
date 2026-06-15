import { vi, beforeEach } from 'vitest';

// Spy on console methods to reduce test noise
beforeEach(() => {
  uuidCounter = 0;  // Reset UUID counter between tests

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

// Mock UUID generation for recognizable-yet-UNIQUE test ids.
//
// The middle `-4123-4123-8123-` marker is load-bearing: session.e2e.test.ts cleans
// up rows by `id::text LIKE '%-4123-4123-8123-%'`, so it MUST stay. Everything else
// must carry enough entropy that no two calls ever collide — even across parallel
// vitest fork workers that each reset `uuidCounter` in beforeEach and run in the
// SAME wall-clock window. The previous format took only the HIGH 8 hex digits of
// Date.now() (stable for ~16s) and a per-test-reset counter, so two parallel
// session-start contract tests both produced the byte-identical id
// `<stable-ts>-4123-4123-8123-000100000000` → sessions PK collision → start fails.
//
// Fix: a per-process random base (distinct per fork) + a process-monotonic counter
// (NOT reset by beforeEach) packed into the high and low segments. uuidCounter is
// still exposed/reset for any test that wants a stable sequence WITHIN its own run,
// but uniqueness no longer depends on it.
let uuidCounter = 0;
const procSeed = (Math.floor(Math.random() * 0xffff)).toString(16).padStart(4, '0');
let monoCounter = 0; // process-monotonic; never reset → guarantees cross-call uniqueness
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => {
    monoCounter += 1;
    uuidCounter += 1;
    // High 8 hex: low (varying) bits of Date.now() XOR a rolling salt so even same-ms
    // calls in one process differ. Keeps the timestamp feel, but actually unique.
    const tsHigh = ((Date.now() & 0xffff) ^ (monoCounter & 0xffff))
      .toString(16).padStart(4, '0');
    const seg1 = `${procSeed}${tsHigh}`;                       // 8 hex
    // Low 12 hex: per-process seed + monotonic counter → never collides across forks.
    const seg5 = `${procSeed}${monoCounter.toString(16).padStart(8, '0')}`; // 12 hex
    return `${seg1}-4123-4123-8123-${seg5}`;
  })
}));
