module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/out/**',
    '!**/public/**',
    '!**/styles/**',
    '!**/app/**',
    '!**/components/**',
    '!**/hooks/**',
    '!**/services/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
}