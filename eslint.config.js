import payloadEsLintConfig from '@payloadcms/eslint-config'

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*',
  '**/.git',
  '**/.next/',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/vitest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
  '**/test-results/',
  '**/playwright-report/',
  '**/dev/media/',
  '**/dev/app/(payload)/',
]

export default [
  { ignores: defaultESLintIgnores },
  ...payloadEsLintConfig,
  {
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'no-restricted-exports': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: ['scripts/*.ts', 'scripts/*.mjs', '*.js', '*.mjs', '*.spec.ts', '*.d.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
