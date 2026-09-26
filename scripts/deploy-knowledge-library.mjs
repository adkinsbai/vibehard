import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const release = "/opt/vibehard/releases/20260921-knowledge-library";
const previous = "/opt/vibehard/releases/20260920-module-help";
const unit = "/etc/systemd/system/vibehard.service", backup = `${release}/backup`;
const node = "/usr/local/bin/node", preview = "vibehard-knowledge-ui-preflight.service";
const mode = process.argv[2]; assert.equal(process.getuid(), 0); assert.ok(["preflight", "activate", "rollback", "cleanup"].includes(mode));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `Failed: ${command} ${args[0] ?? ""}; output suppressed`); return result.stdout.trim();
}
const database = new URL(process.env.DATABASE_URL); assert.equal(database.pathname, "/vibehard");
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env });
const property = (service, key) => run("systemctl", ["show", "-p", key, "--value", service]);
const idle = () => assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Active tasks; refusing restart");
const cleanup = () => { spawnSync("systemctl", ["stop", preview]); spawnSync("systemctl", ["reset-failed", preview]); };
function fileHash(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function files(root, prefix = "") {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${root}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]).sort();
}
function unchangedBackend() {
  const allowed = new Set([
    "app/app/knowledge/page.tsx", "app/app/board-library/page.tsx",
    "components/app/board-library.tsx", "components/app/catalog-nav-link.tsx", "components/app/knowledge-library.tsx",
    "components/app/app-nav.tsx", "components/app/app-sidebar.tsx",
    "lib/board-catalog.ts", "lib/knowledge-catalog.ts", "lib/server/board-catalog.ts",
    "lib/server/data/board-catalog.json", "lib/module-help.ts",
  ]);
  const actual = [];
  for (const dir of ["app", "components", "lib", "runner", "gateway", "drizzle", "public"]) {
    const oldFiles = files(`${previous}/source/${dir}`), newFiles = files(`${release}/source/${dir}`);
    for (const name of new Set([...oldFiles, ...newFiles])) {
      const file = `${dir}/${name}`;
      if (!oldFiles.includes(name) || !newFiles.includes(name) || fileHash(`${release}/source/${file}`) !== fileHash(`${previous}/source/${file}`)) {
        assert.ok(allowed.has(file), `Out-of-scope runtime change: ${file}`); actual.push(file);
      }
    }
  }
  for (const file of ["package.json", "pnpm-lock.yaml", "next.config.ts", "proxy.ts", "instrumentation.ts"]) assert.equal(fileHash(`${release}/source/${file}`), fileHash(`${previous}/source/${file}`), file);
  assert.deepEqual(actual.sort(), [...allowed].sort());
  console.log("Exactly 12 allowed knowledge UI runtime files changed; other runtime/PCB/Demo/auth/schema/dependencies unchanged");
}
async function ready(port) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Readiness timeout");
}
function verify(port) {
  for (const [script, args] of [
    ["verify-frontend-release.mjs", [`http://127.0.0.1:${port}`, `${release}/standalone`]],
    ["verify-admin-sections.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-auth-cookies.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-design-knowledge.mjs", [`http://127.0.0.1:${port}/vibehard`, "--static"]],
    ["verify-engineering-workflow.mjs", ["static", String(port)]],
    ["verify-module-help.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-knowledge-library.mjs", [`http://127.0.0.1:${port}/vibehard`]],
  ]) console.log(run(node, [`${release}/scripts/${script}`, ...args]));
}
async function restore() { copyFileSync(`${backup}/vibehard.service`, unit); run("systemctl", ["daemon-reload"]); run("systemctl", ["restart", "vibehard.service"]); await ready(3210); }
if (mode === "cleanup") cleanup();
if (mode === "preflight") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`); unchangedBackend();
  run("systemd-run", ["--unit=vibehard-knowledge-ui-preflight", "--property=Type=simple", `--property=WorkingDirectory=${release}/standalone`, "--property=EnvironmentFile=/etc/vibehard/platform.env", "--property=MemoryMax=768M", "--property=CPUQuota=100%", "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", "--setenv=NODE_ENV=production", node, "server.js"]);
  try { await ready(3211); verify(3211); } catch (error) { cleanup(); throw error; }
}
if (mode === "activate") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previous}/standalone`); unchangedBackend(); idle(); verify(3211);
  assert.ok(!existsSync(backup)); mkdirSync(backup, { mode: 0o700 }); copyFileSync(unit, `${backup}/vibehard.service`);
  const protectedPids = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service"].map(service => [service, property(service, "MainPID")]);
  const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]);
  const configFiles = ["/etc/vibehard/platform.env", "/etc/vibehard/runner.env", "/etc/vibehard/model.env", "/home/lincaigui/nginx/nginx.conf"].map(path => [path, fileHash(path)]);
  run("systemctl", ["stop", "vibehard.service"]);
  try { idle(); } catch (error) { run("systemctl", ["start", "vibehard.service"]); cleanup(); throw error; }
  try {
    writeFileSync(unit, readFileSync(unit, "utf8").replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${release}/standalone`));
    run("systemctl", ["daemon-reload"]); run("systemctl", ["start", "vibehard.service"]); await ready(3210); verify(3210);
    for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid);
    for (const [path, hash] of configFiles) assert.equal(fileHash(path), hash);
    assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]), nginxPid);
    console.log("Knowledge library UI activated; Runner/Gateway/VibeBoard/nginx and secret/config files unchanged");
  } catch (error) { await restore(); throw error; }
  finally { cleanup(); }
}
if (mode === "rollback") { idle(); await restore(); cleanup(); console.log("Previous platform restored; database/config/Runner unchanged"); }
