module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^jose/webcrypto/(.*)$': '<rootDir>/node_modules/jose/dist/node/cjs/$1',
  },
};
