module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['src/**/*.js', '!src/scripts/**', '!src/server.js'],
  coverageDirectory: 'coverage',
  testTimeout: 10000,
};
