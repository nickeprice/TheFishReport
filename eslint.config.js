export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'warn',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-undef': 'error',
    },
  },
];