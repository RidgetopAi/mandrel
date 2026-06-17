module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // @typescript-eslint/recommended turns OFF core no-redeclare in favour of its
    // own version, which (intentionally) does NOT flag duplicate `interface`
    // declarations because TS merges them. We re-enable the core rule so that
    // accidental duplicate type declarations stay a hard error.
    'no-redeclare': 'error',
    // The following recommended rules flag legitimate, idiomatic patterns in this
    // codebase (test-time require() after jest.mock, `Function` as a generic
    // callback type, Express `declare global { namespace Express }` augmentation).
    // They are real tech-debt signals worth tracking but are NOT bugs and a forced
    // rewrite would risk runtime/behavioural change — so they are warnings (visible,
    // non-blocking), not errors. Revisit as a dedicated cleanup task.
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/ban-types': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn'
  },
  overrides: [
    {
      // Test files get the Jest globals (describe/it/expect/jest/beforeEach/...).
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      env: {
        jest: true,
        node: true,
        es2022: true
      }
    }
  ],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.js'
  ]
};
