import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, ftruncateSync } from "node:fs";
import { spawnSync } from "node:child_process";
const release = "/opt/vibehard/releases/20260920-knowledge-review";
const previous = "/opt/vibehard/releases/20260919-project-knowledge/standalone";
const testEnvFile = "/opt/vibehard/test-state/20260919-project-knowledge/test.env";
const unit = "/etc/systemd/system/vibehard.service", backup = `${release}/backup`;
const nginxFile = "/home/lincaigui/nginx/nginx.conf";
const node = "/usr/local/bin/node", preflightUnit = "vibehard-review-preflight.service";
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["status", "preflight", "activate", "rollback", "cleanup"].includes(mode));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `Operation failed: ${command} ${args[0] ?? ""} (output suppressed)`);
  return result.stdout.trim();
}
const database = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const property = (service, name) => run("systemctl", ["show", "-p", name, "--value", service]);
const idle = () => assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Active tasks; no restart allowed");
const legacy = () => query("select count(*) from project_knowledge k cross join lateral jsonb_array_elements(k.documents) d cross join lateral jsonb_array_elements(d->'versions') v left join users u on u.id::text=v->>'reviewedBy' where d->>'publishedVersion'=v->>'version' and coalesce(u.role,'missing') not in ('admin','developer')");
const identityHash = () => query("select md5(coalesce(string_agg(id::text||role||password_hash,',' order by id),'')) from users");
const protectedServices = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service"];
const cleanup = () => { spawnSync("systemctl", ["stop", preflightUnit]); spawnSync("systemctl", ["reset-failed", preflightUnit]); };
async function ready(port) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Platform readiness timeout");
}
function verify(port) {
  for (const [script, args] of [
    ["verify-frontend-release.mjs", [`http://127.0.0.1:${port}`, `${release}/standalone`]],
    ["verify-admin-sections.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-auth-cookies.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-design-knowledge.mjs", [`http://127.0.0.1:${port}/vibehard`, "--static"]],
    ["verify-engineering-workflow.mjs", ["static", String(port)]],
    ["verify-knowledge-review.mjs", [port === 3211 ? "preflight" : "production"]],
  ]) console.log(run(node, [`${release}/scripts/${script}`, ...args]));
}
// Keep the inode: nginx bind-mounts this exact file, not its directory.
function replaceNginx(text) {
  const fd = openSync(nginxFile, "r+");
  try { writeFileSync(fd, text); ftruncateSync(fd, Buffer.byteLength(text)); } finally { closeSync(fd); }
  run("docker", ["exec", "nginx", "nginx", "-t"]);
  run("docker", ["exec", "nginx", "nginx", "-s", "reload"]);
}
async function restore() {
  copyFileSync(`${backup}/vibehard.service`, unit);
  if (existsSync(`${backup}/nginx.conf`)) replaceNginx(readFileSync(`${backup}/nginx.conf`, "utf8"));
  run("systemctl", ["daemon-reload"]); run("systemctl", ["restart", "vibehard.service"]); await ready(3210);
}
if (mode === "status") {
  assert.equal(pgEnv.PGDATABASE, "vibehard");
  console.log(JSON.stringify({ activeTurns: query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), legacyUnprivilegedPublished: legacy(), roles: JSON.parse(query("select coalesce(json_agg(t),'[]') from (select role,count(*) from users group by role) t")), runners: JSON.parse(query("select coalesce(json_agg(json_build_object('key',runner_key,'status',status,'ageSeconds',extract(epoch from now()-last_heartbeat_at))),'[]') from runner_nodes")) }));
}
if (mode === "cleanup") cleanup();
if (mode === "preflight") {
  assert.equal(pgEnv.PGDATABASE, "vibehard_knowledge_test_20260919");
  assert.equal(property("vibehard.service", "WorkingDirectory"), previous);
  run("systemd-run", ["--unit=vibehard-review-preflight", "--property=Type=simple", `--property=WorkingDirectory=${release}/standalone`, `--property=EnvironmentFile=${testEnvFile}`, "--property=MemoryMax=768M", "--property=CPUQuota=100%", "--setenv=NODE_ENV=production", "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", node, "server.js"]);
  try {
    await ready(3211);
    // Seed isolated reviewer fixtures before the existing administrator regression checks.
    console.log(run(node, [`${release}/scripts/verify-knowledge-review.mjs`, "preflight"]));
    verify(3211);
    mkdirSync(`${release}/verification`, { mode: 0o700, recursive: true });
    writeFileSync(`${release}/verification/preflight.json`, JSON.stringify({ at: new Date().toISOString(), database: pgEnv.PGDATABASE, passed: true }), { mode: 0o600 });
  } catch (error) { cleanup(); throw error; }
}
if (mode === "rollback") { assert.equal(pgEnv.PGDATABASE, "vibehard"); idle(); await restore(); cleanup(); console.log("Platform and proxy restored; database and Runner unchanged"); }
if (mode === "activate") {
  assert.equal(pgEnv.PGDATABASE, "vibehard");
  assert.equal(property("vibehard.service", "WorkingDirectory"), previous);
  assert.ok(JSON.parse(readFileSync(`${release}/verification/preflight.json`, "utf8")).passed);
  idle(); assert.equal(legacy(), "0", "Legacy owner-published knowledge requires an explicit re-review decision");
  assert.ok(!existsSync(backup)); mkdirSync(backup, { mode: 0o700 });
  run("/usr/bin/pg_dump", ["--format=custom", `--file=${backup}/platform.dump`], { env: pgEnv });
  assert.ok(run("/usr/bin/pg_restore", ["--list", `${backup}/platform.dump`]).includes("TABLE DATA"));
  copyFileSync(unit, `${backup}/vibehard.service`); copyFileSync(nginxFile, `${backup}/nginx.conf`);
  const originalNginx = readFileSync(nginxFile, "utf8");
  const location = "        location /vibehard/ {\n";
  assert.equal(originalNginx.split(location).length, 2);
  const modifiedNginx = originalNginx.replace(location, `${location}            client_max_body_size 6m;\n`);
  const protectedPids = protectedServices.map(service => [service, property(service, "MainPID")]);
  const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]);
  const accounts = identityHash();
  run("systemctl", ["stop", "vibehard.service"]);
  try { idle(); } catch (error) { run("systemctl", ["start", "vibehard.service"]); throw error; }
  try {
    writeFileSync(unit, readFileSync(unit, "utf8").replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${release}/standalone`));
    run("systemctl", ["daemon-reload"]); run("systemctl", ["start", "vibehard.service"]);
    await ready(3210); verify(3210);
    replaceNginx(modifiedNginx);
    for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid);
    assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]), nginxPid);
    assert.equal(identityHash(), accounts, "Accounts unexpectedly changed");
    console.log("Activated platform only; protected service PIDs/accounts unchanged; proxy gracefully reloaded");
  } catch (error) { await restore(); throw error; }
  finally { cleanup(); }
}
