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

// Mock UUID generation for consistent test results
// Use timestamp + counter to generate unique UUIDs for each call
let uuidCounter = 0;
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => {
    const timestamp = Date.now().toString(16).padStart(12, '0').substring(0, 8);
    const count = (++uuidCounter).toString(16).padStart(4, '0');
    return `${timestamp}-4123-4123-8123-${count}00000000`;
  })
}));
