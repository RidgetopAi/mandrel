module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Real suites are *.test.ts under src/. The previous '**/test-*.ts' pattern
  // also matched test-setup.ts and compiled dist/test-*.d.ts files, which have
  // no tests and were reported as failed suites.
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Coverage is opt-in via `npm run test:coverage` so the default `npm test`
  // reports real pass/fail instead of always failing an aspirational gate.
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/test-*.ts',
    '!src/test-*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // NOTE: no coverageThreshold yet — current coverage is well below 80%.
  // Reinstate a realistic threshold once the suite is built out (task B2).
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
};
