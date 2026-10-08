import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        module: 'readonly',
        require: 'readonly',
        State: 'readonly',
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