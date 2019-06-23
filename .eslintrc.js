module.exports = {
  extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint', 'plugin:prettier/recommended'],
  plugins: ['@typescript-eslint'],
  rules: { 'require-jsdoc': 'off', 'no-console': 'off' },
  overrides: {
    files: 'src/**/*.ts',
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: './tsconfig.json',
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
  },
};
