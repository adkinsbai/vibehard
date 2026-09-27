// Run with node --env-file=<private test.env>; SSH tunnel localhost:15432 -> server localhost:5432.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.pathname, "/vibehard_knowledge_test_20260919", "Only the disposable database is allowed");
assert.equal(database.username, "vibehard_knowledge_test_20260919");
assert.equal(database.hostname, "127.0.0.1");
database.port = "15432";
const env = { ...process.env, DATABASE_URL: database.toString(), DEFAULT_RUNNER_KEY: "local-runner" };
for (const args of [["exec", "tsx", "scripts/migrate.ts"], ["exec", "vitest", "run", "__tests__/store-postgres.test.ts", "__tests__/knowledge-postgres.test.ts", "--maxWorkers=1", "--testTimeout=30000"]]) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  assert.equal(result.status, 0, "Disposable PostgreSQL verification failed");
}
