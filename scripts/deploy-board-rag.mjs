// Root-only production rollout. Additive schema/data are deliberately not
// dropped on rollback; the pre-change dump is retained for a separate restore.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const release = "/opt/vibehard/releases/20260925-board-rag-v3";
const previous = "/opt/vibehard/releases/20260925-llm-model-discovery-v2";
const platformUnit = "/etc/systemd/system/vibehard.service";
const workerUnit = "/etc/systemd/system/vibehard-design-worker.service";
const candidate = "vibehard-rag-candidate.service";
const backup = `${release}/backup`;
const node = "/usr/local/bin/node";
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["backup", "migrate", "activate", "rollback", "cleanup"].includes(mode));
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/vibehard", "Refusing non-production DATABASE_URL");
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `Failed: ${command} ${args[0] ?? ""}; output suppressed`);
  return result.stdout.trim();
};
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const property = (unit, key) => run("systemctl", ["show", "-p", key, "--value", unit]);
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const activeTurns = () => Number(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"));
const activeDesigns = () => Number(query("select count(*) from design_jobs where status in ('queued','running')"));
const models = () => createHash("sha256").update(query("select purpose,base_url,model,protocol,encrypted_api_key,revision from llm_settings order by purpose")).digest("hex");
const table = name => query(`select to_regclass('public.${name}') is not null`) === "t";
const files = (dir, prefix = "") => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(`${dir}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]).sort();
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, "utf8"));
const base = JSON.parse(readFileSync(`${previous}/RELEASE.json`, "utf8"));
assert.equal(manifest.release, "20260925-board-rag-v3");
assert.equal(manifest.previousRelease, base.release);

function verifySource() {
  const expected = Object.keys(manifest.sourceSha256).sort();
  assert.deepEqual(files(`${release}/source`), expected, "Unexpected source file set");
  for (const file of expected) assert.equal(digest(`${release}/source/${file}`), manifest.sourceSha256[file], `Source hash mismatch: ${file}`);
  const changed = expected.filter(file => base.sourceSha256[file] !== manifest.sourceSha256[file]);
  assert.deepEqual(changed, [...manifest.sourceOverlay].sort(), "Unexpected source overlay");
  for (const protectedPath of base.protectedFrontend) {
    for (const [file, hash] of Object.entries(base.sourceSha256)) {
      if (file === protectedPath || file.startsWith(`${protectedPath}/`)) assert.equal(manifest.sourceSha256[file], hash, `Protected source changed: ${file}`);
    }
  }
}
function backupReady() {
  const meta = JSON.parse(readFileSync(`${backup}/BACKUP.json`, "utf8"));
  assert.equal(meta.database, "vibehard");
  assert.ok([manifest.release, "20260925-board-rag-v2"].includes(meta.release), "Backup belongs to another deployment");
  assert.equal(digest(`${backup}/platform.dump`), meta.sha256, "Backup digest changed");
  assert.ok(existsSync(`${backup}/vibehard.service`));
}
function cleanup() {
  spawnSync("systemctl", ["stop", candidate]);
  spawnSync("systemctl", ["reset-failed", candidate]);
}
async function ready(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Platform readiness timeout");
}
async function stableWorker() {
  const startPid = property("vibehard-design-worker.service", "MainPID");
  const startRestarts = property("vibehard-design-worker.service", "NRestarts");
  assert.ok(Number(startPid) > 0, "Worker has no running process");
  await new Promise(resolve => setTimeout(resolve, 8000));
  assert.equal(property("vibehard-design-worker.service", "ActiveState"), "active", "Worker exited after startup");
  assert.equal(property("vibehard-design-worker.service", "MainPID"), startPid, "Worker restarted after startup");
  assert.equal(property("vibehard-design-worker.service", "NRestarts"), startRestarts, "Worker restarted after startup");
}
function verify(port) {
  const baseUrl = `http://127.0.0.1:${port}/vibehard`;
  for (const [script, args] of [
    ["verify-frontend-release.mjs", [`http://127.0.0.1:${port}`, `${release}/standalone`]],
    ["verify-admin-sections.mjs", [baseUrl]],
    ["verify-auth-cookies.mjs", [baseUrl]],
    ["verify-design-knowledge.mjs", [baseUrl, "--static"]],
    ["verify-engineering-workflow.mjs", ["static", String(port)]],
    ["verify-module-help.mjs", [baseUrl]],
    ["verify-knowledge-library.mjs", [baseUrl]],
    ["verify-homepage.mjs", [baseUrl]],
    ["verify-taishan-integration.mjs", [baseUrl]],
    ["verify-llm-model-discovery.mjs", [baseUrl]],
  ]) console.log(run(node, [`${release}/scripts/${script}`, ...args]));
}
async function restorePlatform() {
  if (existsSync(workerUnit)) spawnSync("systemctl", ["disable", "--now", "vibehard-design-worker.service"]);
  copyFileSync(`${backup}/vibehard.service`, platformUnit);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["restart", "vibehard.service"]);
  await ready(3210);
}

if (mode === "cleanup") { cleanup(); console.log(JSON.stringify({ stopped: candidate })); }
if (mode === "backup") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  assert.equal(activeTurns(), 0, "Agent tasks active");
  assert.equal(table("design_jobs"), false); assert.equal(table("shared_knowledge"), false);
  assert.ok(!existsSync(backup) && !existsSync(workerUnit), "Backup or worker unit already exists");
  verifySource();
  mkdirSync(backup, { mode: 0o700 });
  copyFileSync(platformUnit, `${backup}/vibehard.service`);
  run("/usr/bin/pg_dump", ["-Fc", "-f", `${backup}/platform.dump`, "vibehard"], { env: pgEnv });
  const listing = run("/usr/bin/pg_restore", ["--list", `${backup}/platform.dump`]);
  assert.ok(listing.includes("TABLE DATA public users"), "Incomplete database dump");
  writeFileSync(`${backup}/BACKUP.json`, JSON.stringify({ database: "vibehard", release: manifest.release,
    sha256: digest(`${backup}/platform.dump`), createdAt: new Date().toISOString() }), { mode: 0o600 });
  console.log(JSON.stringify({ backedUp: true, sha256: digest(`${backup}/platform.dump`), migrationsPending: 2 }));
}
if (mode === "migrate") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  assert.equal(activeTurns(), 0, "Agent tasks active");
  backupReady(); verifySource();
  assert.equal(table("design_jobs"), false); assert.equal(table("shared_knowledge"), false);
  run(node, [`${release}/services/migrate.cjs`], { cwd: `${release}/source`, env: process.env });
  assert.equal(table("design_jobs"), true); assert.equal(table("shared_knowledge"), true);
  assert.equal(query("select count(*) from design_jobs"), "0");
  assert.equal(query("select count(*) from shared_knowledge"), "0");
  console.log(JSON.stringify({ migrated: true, tables: ["design_jobs", "shared_knowledge"], oldPlatformStillActive: true }));
}
if (mode === "activate") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  assert.equal(run("systemctl", ["is-active", candidate]), "active", "Isolated candidate must pass first");
  backupReady(); verifySource();
  assert.equal(table("design_jobs"), true); assert.equal(table("shared_knowledge"), true);
  assert.equal(activeTurns(), 0, "Agent tasks active");
  assert.equal(activeDesigns(), 0, "Design tasks active");
  assert.ok(!existsSync(workerUnit), "Worker unit already installed");
  const protectedPids = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service"].map(service => [service, property(service, "MainPID")]);
  const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]);
  const configFiles = ["/etc/vibehard/platform.env", "/etc/vibehard/runner.env", "/etc/vibehard/model.env", "/home/lincaigui/nginx/nginx.conf"].map(file => [file, digest(file)]);
  const modelBefore = models();
  run("systemctl", ["stop", "vibehard.service"]);
  try {
    assert.equal(activeTurns(), 0, "Agent task appeared during cutover");
    const current = readFileSync(platformUnit, "utf8");
    assert.ok(current.includes(`WorkingDirectory=${previous}/standalone`));
    writeFileSync(platformUnit, current.replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${release}/standalone`));
    const template = readFileSync(`${release}/source/deploy/systemd/vibehard-design-worker.service`, "utf8");
    assert.ok(template.includes("/opt/vibehard/current"));
    writeFileSync(workerUnit, template.replaceAll("/opt/vibehard/current", release));
    run("systemctl", ["daemon-reload"]);
    run("systemctl", ["enable", "--now", "vibehard-design-worker.service"]);
    await stableWorker();
    run("systemctl", ["start", "vibehard.service"]); await ready(3210); verify(3210);
    for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid, `${service} changed`);
    for (const [file, hash] of configFiles) assert.equal(digest(file), hash, `${file} changed`);
    assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]), nginxPid);
    assert.equal(models(), modelBefore, "Model settings changed");
    console.log(JSON.stringify({ activated: manifest.release, worker: "active", otherServicesUnchanged: true, modelConfigUnchanged: true }));
  } catch (error) { await restorePlatform(); throw error; }
  finally { cleanup(); }
}
if (mode === "rollback") {
  backupReady();
  assert.equal(activeTurns(), 0, "Agent tasks active");
  assert.equal(activeDesigns(), 0, "Design tasks active");
  await restorePlatform(); cleanup();
  console.log(JSON.stringify({ restored: base.release, additiveDatabaseTablesRetained: true, importedKnowledgeRetained: true }));
}
