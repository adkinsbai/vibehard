// Import the fixed proof batch into only the isolated RAG database via SSH tunnel.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const name = "vibehard_rag_test";
const key = "/Users/hushaohong/.ssh/ldcx_vibeboard_deploy";
const host = "root@47.102.197.71";
const remote = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "UseKeychain=yes", "-i", key, host,
  `cat /opt/vibehard/test-state/20260925-rag-proof/${name}.env`], { encoding: "utf8" });
assert.equal(remote.status, 0, "Could not read isolated credentials");
const vars = Object.fromEntries(remote.stdout.trim().split("\n").map(line => {
  const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
}));
const url = new URL(vars.DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "15432");
assert.equal(url.pathname, `/${name}`); assert.equal(url.username, name);
const env = { ...process.env, ...vars };
const sql = postgres(vars.DATABASE_URL, { max: 1 });
const email = "rag-proof-admin@invalid.example";
try {
  const [{ count }] = await sql`select count(*)::int as count from shared_knowledge`;
  assert.ok(count === 0 || count === 95, "Unexpected isolated shared knowledge count");
  let [actor] = await sql`select id from users where email=${email}`;
  if (!actor) {
    assert.equal(count, 0, "Missing proof actor after import");
    [actor] = await sql`insert into users(email,password_hash,name,role,invite_code)
      values(${email},'isolated-no-login','RAG Proof Reviewer','developer','ISOLATED') returning id`;
    await sql`insert into projects(user_id,name,workspace_key,runner_key)
      values(${actor.id},'RAG Proof Project',${`isolated/${actor.id}`},'local-runner')`;
  }
  const args = ["--rv1106-root", "/Volumes/ML/RV1106", "--rv1126b-root", "/Volumes/ML/RV1126B"];
  const pdfPython = "/Users/hushaohong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
  const run = extra => {
    const result = spawnSync("node", ["--import", "tsx", "scripts/import-board-knowledge.mjs", ...args, ...extra],
      { env: { ...env, KNOWLEDGE_PDF_PYTHON: pdfPython }, encoding: "utf8", maxBuffer: 2_000_000, timeout: 120_000 });
    assert.equal(result.status, 0, result.stderr || "Batch import failed");
    return result.stdout;
  };
  const preview = JSON.parse(run([]));
  assert.equal(preview.entries, 95);
  assert.equal(preview.batchHash, "7373380e3214781ed7967b29f27ad087de875290d7a782c1b861bc11998abb84");
  const applyArgs = ["--apply", "--actor-id", actor.id, "--database-name", name, "--confirm-batch", preview.batchHash];
  const first = JSON.parse(run(applyArgs).trim().split("\n").at(-1));
  const second = JSON.parse(run(applyArgs).trim().split("\n").at(-1));
  assert.equal(first.inserted + first.skipped, 95); assert.equal(second.skipped, 95);
  const [{ total, published }] = await sql`select count(*)::int as total,
    count(*) filter (where document->>'publishedVersion' is not null)::int as published from shared_knowledge`;
  assert.equal(total, 95); assert.equal(published, 95);
  console.log(JSON.stringify({ database: name, sourceFiles: preview.sourceFiles.length, entries: total,
    published, batchHash: preview.batchHash, idempotent: true, actorRole: "developer", review: "authorized direct test import; not manually reviewed" }));
} finally { await sql.end(); }
