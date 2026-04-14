/** @type {import('jest').Config} */
export default {
  testEnvironment: "jsdom",
  testMatch: [
    "<rootDir>/dist-tsc-jest/tests/**/*.jest.test.js"
  ],
  collectCoverageFrom: [
    "dist-tsc-jest/src/**/*.js"
  ],
  setupFiles: ["<rootDir>/tests/jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/dist-tsc-jest/tests/jest.setup.js"],
  verbose: true,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};
