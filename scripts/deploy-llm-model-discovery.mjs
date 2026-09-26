// Run on the deployment host as root with platform.env loaded. Only the
// platform unit is switched; no database migration or model setting is written.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const release = "/opt/vibehard/releases/20260925-llm-model-discovery-v2";
const previous = "/opt/vibehard/releases/20260922-taishan-integration";
const unit = "/etc/systemd/system/vibehard.service";
const candidate = "vibehard-llm-discovery-candidate.service";
const backup = `${release}/backup`;
const node = "/usr/local/bin/node";
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["prepare", "preflight", "activate", "rollback", "cleanup"].includes(mode));
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.pathname, "/vibehard");
const pgEnv = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432",
  PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `Failed: ${command} ${args[0] ?? ""}; output suppressed`);
  return result.stdout.trim();
}
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const property = (service, key) => run("systemctl", ["show", "-p", key, "--value", service]);
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const idle = () => assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Active tasks; refusing restart");
const modelFingerprint = () => createHash("sha256").update(query("select purpose,base_url,model,protocol,encrypted_api_key,revision from llm_settings order by purpose")).digest("hex");
function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(`${dir}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]).sort();
}
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, "utf8"));
const base = JSON.parse(readFileSync(`${previous}/RELEASE.json`, "utf8"));
assert.equal(manifest.previousRelease, base.release);
function verifySource() {
  const expected = Object.keys(manifest.sourceSha256).sort();
  assert.deepEqual(files(`${release}/source`), expected, "Unexpected source file set");
  for (const file of expected) assert.equal(digest(`${release}/source/${file}`), manifest.sourceSha256[file], `Source hash mismatch: ${file}`);
  const changed = expected.filter(file => base.sourceSha256[file] !== manifest.sourceSha256[file]);
  assert.deepEqual(changed, [...manifest.sourceOverlay].sort(), "Out-of-scope source change");
  for (const protectedPath of base.protectedFrontend) {
    for (const [file, hash] of Object.entries(base.sourceSha256)) {
      if (file === protectedPath || file.startsWith(`${protectedPath}/`)) assert.equal(manifest.sourceSha256[file], hash, `Protected frontend changed: ${file}`);
    }
  }
}
function cleanup() {
  spawnSync("systemctl", ["stop", candidate]);
  spawnSync("systemctl", ["reset-failed", candidate]);
}
async function ready(port) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Platform readiness timeout");
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
async function restore() {
  copyFileSync(`${backup}/vibehard.service`, unit);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["restart", "vibehard.service"]);
  await ready(3210);
}
if (mode === "prepare") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  assert.ok(!existsSync(`${release}/source`));
  assert.ok(existsSync(`${release}/standalone/server.js`));
  assert.deepEqual(files(`${release}/source-overlay`), [...manifest.sourceOverlay].sort());
  for (const [file, hash] of Object.entries(base.sourceSha256)) assert.equal(digest(`${previous}/source/${file}`), hash, `Baseline changed: ${file}`);
  cpSync(`${previous}/source`, `${release}/source`, { recursive: true });
  for (const file of manifest.sourceOverlay) {
    const target = `${release}/source/${file}`;
    mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(`${release}/source-overlay/${file}`, target);
  }
  verifySource();
  console.log(JSON.stringify({ prepared: manifest.release, sourceFiles: Object.keys(manifest.sourceSha256).length, overlayFiles: manifest.sourceOverlay.length }));
}
if (mode === "cleanup") { cleanup(); console.log(JSON.stringify({ stopped: candidate })); }
if (mode === "preflight") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  verifySource(); cleanup();
  run("systemd-run", ["--unit=vibehard-llm-discovery-candidate", "--property=Type=simple",
    `--property=WorkingDirectory=${release}/standalone`, "--property=EnvironmentFile=/etc/vibehard/platform.env",
    "--property=MemoryMax=768M", "--property=CPUQuota=100%", "--property=NoNewPrivileges=yes",
    "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", "--setenv=NODE_ENV=production", node, "server.js"]);
  try { await ready(3211); verify(3211); }
  catch (error) { cleanup(); throw error; }
}
if (mode === "activate") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`);
  assert.equal(run("systemctl", ["is-active", candidate]), "active");
  verifySource(); idle(); verify(3211);
  assert.ok(!existsSync(backup)); mkdirSync(backup, { mode: 0o700 }); copyFileSync(unit, `${backup}/vibehard.service`);
  const protectedPids = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service"].map(service => [service, property(service, "MainPID")]);
  const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]).trim();
  const configFiles = ["/etc/vibehard/platform.env", "/etc/vibehard/runner.env", "/etc/vibehard/model.env", "/home/lincaigui/nginx/nginx.conf"].map(file => [file, digest(file)]);
  const modelsBefore = modelFingerprint();
  run("systemctl", ["stop", "vibehard.service"]);
  try { idle(); } catch (error) { run("systemctl", ["start", "vibehard.service"]); cleanup(); throw error; }
  try {
    const oldUnit = readFileSync(unit, "utf8");
    assert.ok(oldUnit.includes(`WorkingDirectory=${previous}/standalone`));
    writeFileSync(unit, oldUnit.replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${release}/standalone`));
    run("systemctl", ["daemon-reload"]); run("systemctl", ["start", "vibehard.service"]); await ready(3210); verify(3210);
    for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid, `${service} changed`);
    for (const [file, hash] of configFiles) assert.equal(digest(file), hash, `${file} changed`);
    assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]).trim(), nginxPid);
    assert.equal(modelFingerprint(), modelsBefore, "Model configuration changed during deployment");
    console.log(JSON.stringify({ activated: manifest.release, modelConfigUnchanged: true, otherServicesUnchanged: true }));
  } catch (error) { await restore(); throw error; }
  finally { cleanup(); }
}
if (mode === "rollback") { idle(); await restore(); cleanup(); console.log(JSON.stringify({ restored: base.release, modelConfigUntouched: true })); }
