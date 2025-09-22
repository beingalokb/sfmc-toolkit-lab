module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'standard',
    'plugin:security/recommended',
    'plugin:node/recommended'
  ],
  plugins: [
    'security',
    'node'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    // Security-focused rules
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-require': 'warn',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-unsafe-regex': 'error',
    
    // Node.js best practices
    'node/no-unpublished-require': 'off', // Allow dev dependencies in tests
    'node/no-missing-require': 'error',
    'node/no-extraneous-require': 'error',
    
    // General quality rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Prevent common security issues
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // Database security
    'security/detect-sql-injection': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/__tests__/**/*.js'],
      rules: {
        'no-console': 'off',
        'security/detect-object-injection': 'off'
      }
    },
    {
      files: ['server.js', 'routes/**/*.js'],
      rules: {
        'security/detect-child-process': 'error'
      }
    }
  ]
};
