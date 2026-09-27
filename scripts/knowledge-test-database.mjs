// Disposable PostgreSQL test database on the deployment host; never uses production credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const name = "vibehard_knowledge_test_20260919";
const directory = "/opt/vibehard/test-state/20260919-project-knowledge";
const marker = `${directory}/owner.json`;
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["create", "drop", "status"].includes(mode));
function query(sql) {
  const result = spawnSync("runuser", ["-u", "postgres", "--", "psql", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", cwd: "/tmp" });
  assert.equal(result.status, 0, "Test database operation failed (configuration suppressed)");
  return result.stdout.trim();
}
if (mode === "create") {
  assert.ok(!existsSync(marker), "Owned test DB already exists; inspect instead of overwriting");
  assert.equal(query(`select count(*) from pg_database where datname='${name}';`), "0");
  assert.equal(query(`select count(*) from pg_roles where rolname='${name}';`), "0");
  const password = randomBytes(32).toString("hex");
  query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 12;
CREATE DATABASE ${name} OWNER ${name};
REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC;`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(marker, JSON.stringify({ name, createdAt: new Date().toISOString(), purpose: "isolated-project-knowledge-tests" }), { mode: 0o600, flag: "wx" });
  writeFileSync(`${directory}/test.env`, `DATABASE_URL=postgresql://${name}:${password}@127.0.0.1:5432/${name}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nINVITE_CODES=KNOWLEDGE_TEST_ONLY\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ created: name, envFile: `${directory}/test.env`, productionDataCopied: false }));
}
if (mode === "status") console.log(query(`select datname, pg_size_pretty(pg_database_size(oid)) from pg_database where datname='${name}';`));
if (mode === "drop") {
  const ownership = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(ownership.name, name); assert.equal(ownership.purpose, "isolated-project-knowledge-tests");
  assert.equal(query(`select count(*) from pg_stat_activity where datname='${name}';`), "0", "Close test connections before dropping");
  query(`DROP DATABASE ${name}; DROP ROLE ${name};`);
  unlinkSync(`${directory}/test.env`); unlinkSync(marker);
  console.log("Removed only the disposable test database, role and test credentials; fixtures are reproducible");
}
