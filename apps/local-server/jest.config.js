/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  // Integration tests run sequentially against one real test database
  // (docker-compose's local postgres, "shop_test" — see test/setup.ts) so
  // FIFO row-locking behavior is exercised against real Postgres, not a
  // mock that can't reproduce the concurrency guarantees being tested.
  maxWorkers: 1,
};
