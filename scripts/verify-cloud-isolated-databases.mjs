// Run on the development Mac through an already-open localhost:15432 SSH tunnel.
// Credentials stay in process memory and are never printed or stored locally.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const host = "root@47.102.197.71";
const key = "/Users/hushaohong/.ssh/ldcx_vibeboard_deploy";
const prefix = "/opt/vibehard/test-state/20260925-rag-proof";
function environment(name) {
  const remote = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "UseKeychain=yes", "-i", key, host, `cat ${prefix}/${name}.env`], { encoding: "utf8" });
  assert.equal(remote.status, 0, "Could not read isolated test credentials");
  const vars = Object.fromEntries(remote.stdout.trim().split("\n").map(line => {
    const equal = line.indexOf("="); return [line.slice(0, equal), line.slice(equal + 1)];
  }));
  const url = new URL(vars.DATABASE_URL);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "15432");
  assert.equal(url.pathname, `/${name}`); assert.equal(url.username, name);
  return { ...process.env, ...vars, DEFAULT_RUNNER_KEY: "local-runner" };
}
function run(label, args, env) {
  console.log(label);
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  assert.equal(result.status, 0, `${label} failed`);
}
const design = environment("vibehard_design_test");
run("Migrating isolated design database", ["exec", "tsx", "scripts/migrate.ts"], design);
run("Testing durable design jobs", ["exec", "vitest", "run", "__tests__/design-postgres.test.ts", "--maxWorkers=1", "--testTimeout=30000"], { ...design, VIBEHARD_DESIGN_TEST_DATABASE: "1" });

const rag = environment("vibehard_rag_test");
run("Migrating isolated RAG database", ["exec", "tsx", "scripts/migrate.ts"], rag);
run("Testing review, ownership and shared retrieval", ["exec", "vitest", "run", "__tests__/store-postgres.test.ts", "__tests__/knowledge-postgres.test.ts", "__tests__/shared-knowledge-postgres.test.ts", "--maxWorkers=1", "--testTimeout=30000"], { ...rag, VIBEHARD_RAG_TEST_DATABASE: "1" });
console.log("Both isolated databases migrated and PostgreSQL tests passed");
