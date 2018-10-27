module.exports = {
  extends: ['typescript', 'prettier'],
  plugins: ['typescript'],
  rules: { 'require-jsdoc': 'off', 'no-console': 'off' },
  overrides: {
    parser: 'typescript-eslint-parser',
    files: 'src/**/*.ts'
  }
};
