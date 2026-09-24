module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.cjs', 'vite.config.ts'],
  rules: {
    // The two rules that would have caught the audited defects.
    'jsx-a11y/no-autofocus': 'warn',
    // `info` is allowed for the one-time legacy-key migration notice; the rest
    // of the app should use the toast layer rather than the console.
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-hooks/exhaustive-deps': 'error',
  },
};
