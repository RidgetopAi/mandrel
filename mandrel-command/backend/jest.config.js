module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/'],
  testMatch: ['**/*.test.ts', '**/test-*.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/test-*.ts',
    '!src/test-*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
};
