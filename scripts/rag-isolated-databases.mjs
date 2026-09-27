// Execute on the deployment host as root. Only these two disposable databases
// are ever created or removed; production credentials and data are not copied.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const directory = "/opt/vibehard/test-state/20260925-rag-proof";
const marker = `${directory}/owner.json`;
const names = ["vibehard_design_test", "vibehard_rag_test"];
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["create", "status", "drop"].includes(mode));

function query(sql) {
  const result = spawnSync("runuser", ["-u", "postgres", "--", "psql", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", cwd: "/tmp" });
  assert.equal(result.status, 0, "Isolated database operation failed; details suppressed");
  return result.stdout.trim();
}

if (mode === "create") {
  assert.ok(!existsSync(marker), "Test marker already exists; inspect before reusing");
  for (const name of names) {
    assert.equal(query(`select count(*) from pg_database where datname='${name}';`), "0");
    assert.equal(query(`select count(*) from pg_roles where rolname='${name}';`), "0");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const name of names) {
    const password = randomBytes(32).toString("hex");
    query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 12;`);
    query(`CREATE DATABASE ${name} OWNER ${name};`);
    query(`REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC;`);
    writeFileSync(`${directory}/${name}.env`, `DATABASE_URL=postgresql://${name}:${password}@127.0.0.1:15432/${name}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nDEFAULT_RUNNER_KEY=isolated-test\n`, { flag: "wx", mode: 0o600 });
  }
  writeFileSync(marker, JSON.stringify({ names, purpose: "20260925-rag-proof", createdAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ created: names, credentialFiles: names.map(name => `${directory}/${name}.env`), productionDataCopied: false }));
}
if (mode === "status") {
  for (const name of names) console.log(`${name}: ${query(`select count(*) from pg_database where datname='${name}';`)} database`);
  console.log(`marker: ${existsSync(marker)}`);
}
if (mode === "drop") {
  const owner = JSON.parse(readFileSync(marker, "utf8"));
  assert.deepEqual(owner.names, names); assert.equal(owner.purpose, "20260925-rag-proof");
  for (const name of names) assert.equal(query(`select count(*) from pg_stat_activity where datname='${name}';`), "0", `Active ${name} connections`);
  for (const name of names) {
    query(`DROP DATABASE ${name};`);
    query(`DROP ROLE ${name};`);
    unlinkSync(`${directory}/${name}.env`);
  }
  unlinkSync(marker);
  console.log(JSON.stringify({ removed: names }));
}
