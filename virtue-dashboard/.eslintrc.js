module.exports = {
  root: true,
  extends: ['next', 'next/core-web-vitals'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    'react/no-unescaped-entities': 'off'
  }
};
