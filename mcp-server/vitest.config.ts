import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 10000,
    setupFiles: ['./vitest.setup.ts']
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});
