// Production cutover for the verified candidate. Only platform and design
// worker units change. On failure, restore the exact pre-cutover unit files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const release = "/opt/vibehard/releases/20260926-esp32-fts-v1";
const index = "/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite";
const platform = "/etc/systemd/system/vibehard.service";
const worker = "/etc/systemd/system/vibehard-design-worker.service";
const backup = `${release}/backup`;
assert.equal(process.getuid(), 0);
assert.equal(process.argv[2], "activate");
assert.equal(new URL(process.env.DATABASE_URL).pathname, "/vibehard");
const run = (command, args, options = {}) => {
  const answer = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(answer.status, 0, `Command failed: ${command} ${args[0] ?? ""}; output suppressed`);
  return answer.stdout.trim();
};
const property = (service, key) => run("systemctl", ["show", "-p", key, "--value", service]);
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const url = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const idle = () => {
  assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Agent turn in progress");
  assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"), "0", "Design task in progress");
};
const protectedServices = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service", "vibehard-eda-manager.service"];
const protectedPids = protectedServices.map(service => [service, property(service, "MainPID")]);
const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]).trim();
const configFiles = ["/etc/vibehard/platform.env", "/etc/vibehard/eda-platform.env", "/etc/vibehard/runner.env", "/etc/vibehard/model.env"];
const configHashes = configFiles.filter(existsSync).map(file => [file, digest(file)]);
const originalPlatform = readFileSync(platform, "utf8");
const originalWorker = readFileSync(worker, "utf8");
assert.ok(originalPlatform.includes("WorkingDirectory=/opt/vibehard/releases/20260926-eda-grid-v1/standalone"));
assert.ok(originalWorker.includes("WorkingDirectory=/opt/vibehard/releases/20260925-board-rag-v3"));
assert.ok(originalWorker.includes("MemoryMax=256M") && originalWorker.includes("DynamicUser=true"));
assert.equal(property("vibehard-oss-rag-platform-candidate.service", "ActiveState"), "active");
assert.equal(property("vibehard-oss-rag-worker-candidate.service", "ActiveState"), "active");
assert.equal(property("vibehard-design-worker.service", "ActiveState"), "inactive");
idle();
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, "utf8"));
assert.equal(manifest.release, "20260926-esp32-fts-v1");
assert.equal(manifest.indexSqliteSha256, digest(index));
assert.equal(manifest.workerSha256, digest(`${release}/services/design-worker.cjs`));
for (const [file, hash] of Object.entries(manifest.sourceSha256)) assert.equal(digest(`${release}/source/${file}`), hash, `Source changed: ${file}`);
assert.ok(!existsSync(backup), "Backup already exists; refusing a second activation");
mkdirSync(backup, { mode: 0o700 });
copyFileSync(platform, `${backup}/vibehard.service`);
copyFileSync(worker, `${backup}/vibehard-design-worker.service`);
const newPlatform = originalPlatform.replace("WorkingDirectory=/opt/vibehard/releases/20260926-eda-grid-v1/standalone",
  `WorkingDirectory=${release}/standalone`);
const newWorker = originalWorker
  .replace("WorkingDirectory=/opt/vibehard/releases/20260925-board-rag-v3", `WorkingDirectory=${release}`)
  .replace("ExecStart=/opt/vibehard/runtime/node-v22.23.1 /opt/vibehard/releases/20260925-board-rag-v3/services/design-worker.cjs",
    `ExecStart=/opt/vibehard/runtime/node-v22.23.1 ${release}/services/design-worker.cjs`)
  .replace("DynamicUser=true", "DynamicUser=true\nSupplementaryGroups=vibehard-knowledge")
  .replace("EnvironmentFile=/etc/vibehard/platform.env", `EnvironmentFile=/etc/vibehard/platform.env\nEnvironment=VIBEHARD_OSS_INDEX_PATH=${index}`)
  .replace("MemoryMax=256M", "MemoryMax=384M");
assert.ok(newWorker.includes(`Environment=VIBEHARD_OSS_INDEX_PATH=${index}`));
assert.ok(newWorker.includes(`ExecStart=/opt/vibehard/runtime/node-v22.23.1 ${release}/services/design-worker.cjs`));
async function ready() {
  for (let attempt = 0; attempt < 25; attempt++) {
    try { if ((await fetch("http://127.0.0.1:3210/vibehard/login", { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Platform readiness timed out");
}
function restore() {
  spawnSync("systemctl", ["stop", "vibehard.service"]);
  spawnSync("systemctl", ["stop", "vibehard-design-worker.service"]);
  copyFileSync(`${backup}/vibehard.service`, platform);
  copyFileSync(`${backup}/vibehard-design-worker.service`, worker);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["start", "vibehard-design-worker.service"]);
  run("systemctl", ["start", "vibehard.service"]);
}
try {
  run("systemctl", ["stop", "vibehard-oss-rag-worker-candidate.service"]);
  run("systemctl", ["stop", "vibehard.service"]);
  idle();
  writeFileSync(platform, newPlatform);
  writeFileSync(worker, newWorker);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["start", "vibehard-design-worker.service"]);
  run("systemctl", ["start", "vibehard.service"]);
  await ready();
  const workerPid = property("vibehard-design-worker.service", "MainPID");
  assert.ok(Number(workerPid) > 0);
  await new Promise(resolve => setTimeout(resolve, 8000));
  assert.equal(property("vibehard-design-worker.service", "MainPID"), workerPid, "Design worker restarted");
  assert.equal(property("vibehard-design-worker.service", "ActiveState"), "active");
  assert.equal(property("vibehard.service", "ActiveState"), "active");
  for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid, `Protected service changed: ${service}`);
  assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]).trim(), nginxPid);
  for (const [file, hash] of configHashes) assert.equal(digest(file), hash, `Config changed: ${file}`);
  console.log(JSON.stringify({ activated: manifest.release, workerStable: true, protectedServicesUnchanged: true,
    configFilesUnchanged: true, indexSha256: manifest.indexSqliteSha256 }));
} catch (error) {
  restore();
  console.error("Activation failed; prior platform and worker units restored.");
  throw error;
} finally { spawnSync("systemctl", ["stop", "vibehard-oss-rag-platform-candidate.service"]); }
