// ESLint v9 flat config for the Mandrel MCP server.
// Replaces the legacy .eslintrc setup (the old `lint` script silently no-op'd
// because v9 requires a flat config). Pragmatic baseline: TypeScript-aware,
// with the noisiest rules as warnings so the linter gives signal without a
// wall of errors. Tighten over time (task B1 / B4).

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'scripts/**',
      '**/*.d.ts',
      '**/*.test.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript itself handles undefined identifiers + globals.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Too noisy to enforce as errors in this codebase yet — surface as warnings.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
    },
  },
];
