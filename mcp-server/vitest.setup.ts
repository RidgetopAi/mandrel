import { vi, beforeEach } from 'vitest';

// Spy on console methods to reduce test noise
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

// Mock UUID generation for consistent test results
// Use a counter to generate unique UUIDs for each call
let uuidCounter = 0;
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => {
    const count = (++uuidCounter).toString(16).padStart(12, '0');
    return `12345678-1234-4123-8123-${count}`;
  })
}));
