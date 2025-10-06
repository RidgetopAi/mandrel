import { vi } from 'vitest';

// Mock console methods to reduce test noise
vi.mock('console', () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
}));

// Mock UUID generation for consistent test results
// Use a counter to generate unique UUIDs for each call
let uuidCounter = 0;
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => {
    const count = (++uuidCounter).toString(16).padStart(12, '0');
    return `12345678-1234-4123-8123-${count}`;
  })
}));
