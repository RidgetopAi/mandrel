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
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-123-456-789')
}));
