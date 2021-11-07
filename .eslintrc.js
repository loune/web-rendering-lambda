module.exports = {
  extends: [
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  plugins: ['@typescript-eslint'],
  rules: { 'require-jsdoc': 'off', 'no-console': 'off' },
  overrides: [
    {
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
      rules: {
        'import/namespace': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
