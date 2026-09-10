import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

/**
 * Flat ESLint config.
 *
 * Layering, in order:
 *   1. Next.js core-web-vitals  - framework + accessibility + performance rules
 *   2. Next.js typescript       - typescript-eslint recommended, wired for Next
 *   3. Repository rules         - the conventions in .github/instructions/
 *   4. eslint-config-prettier   - LAST, disables every stylistic rule so
 *                                 Prettier owns formatting without conflicts
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: 'template/rules',
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      // Deterministic import order. Auto-fixable with `pnpm lint:fix`.
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // Unused code is dead weight; `_`-prefixed args are an explicit opt-out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` erases the guarantees the strict tsconfig is buying us.
      '@typescript-eslint/no-explicit-any': 'error',

      // Prefer `import type` so type-only imports are erased at compile time.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Server logs belong in a structured logger, not stdout noise.
      // `console.warn`/`console.error` stay allowed for genuine failures.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Catch `==`, implicit globals and other classic footguns.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'always'],
    },
  },

  {
    name: 'template/config-and-scripts',
    files: ['*.config.{ts,mjs,js}', 'scripts/**', 'tests/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'pnpm-lock.yaml',
  ]),
]);
