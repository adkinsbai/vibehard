import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const release = "/opt/vibehard/releases/20260919-engineering-workflow";
const previous = "/opt/vibehard/releases/20260919-design-knowledge-pricing/standalone";
const backup = `${release}/backup`;
const platformUnit = "/etc/systemd/system/vibehard.service";
const runnerUnit = "/etc/systemd/system/vibehard-runner.service";
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["status", "preflight", "activate", "rollback"].includes(mode));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `Command failed: ${command} ${args[0] ?? ""}`);
  return result.stdout.trim();
};
const database = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
const query = (sql) => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const idle = () => assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Active tasks exist; refusing restart");
const property = (service, name) => run("systemctl", ["show", "-p", name, "--value", service]);
const node = "/usr/local/bin/node";
const ready = async (port) => {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Platform readiness timeout");
};
const verify = (port) => {
  for (const [script, args] of [
    ["verify-frontend-release.mjs", [`http://127.0.0.1:${port}`, `${release}/standalone`]],
    ["verify-admin-sections.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-auth-cookies.mjs", [`http://127.0.0.1:${port}/vibehard`]],
    ["verify-design-knowledge.mjs", [`http://127.0.0.1:${port}/vibehard`, "--static"]],
    ["verify-engineering-workflow.mjs", ["static", String(port)]],
  ]) console.log(run(node, [`${release}/scripts/${script}`, ...args]));
};
const cleanup = () => {
  spawnSync("systemctl", ["stop", "vibehard-engineering-preflight.service"]);
  spawnSync("systemctl", ["reset-failed", "vibehard-engineering-preflight.service"]);
};
const restore = async () => {
  for (const [source, target] of [[`${backup}/vibehard.service`, platformUnit], [`${backup}/vibehard-runner.service`, runnerUnit]]) copyFileSync(source, target);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["restart", "vibehard.service", "vibehard-runner.service"]);
  await ready(3210);
};
if (mode === "status") {
  console.log(JSON.stringify({ activeTurns: query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), runners: JSON.parse(query("select coalesce(json_agg(json_build_object('key',runner_key,'status',status,'heartbeat',last_heartbeat_at,'ageSeconds',extract(epoch from now()-last_heartbeat_at))), '[]') from runner_nodes")) }));
}
if (mode === "preflight") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), previous);
  assert.ok(existsSync(`${release}/services/runner.cjs`));
  run("systemd-run", ["--unit=vibehard-engineering-preflight", "--property=Type=simple", `--property=WorkingDirectory=${release}/standalone`, "--property=EnvironmentFile=/etc/vibehard/platform.env", "--setenv=NODE_ENV=production", "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", node, "server.js"]);
  try { await ready(3211); verify(3211); } catch (error) { cleanup(); throw error; }
}
if (mode === "rollback") {
  idle();
  assert.ok(existsSync(`${backup}/vibehard-runner.service`));
  run("systemctl", ["stop", "vibehard.service"]);
  try { idle(); } catch (error) { run("systemctl", ["start", "vibehard.service"]); throw error; }
  await restore(); cleanup();
  console.log("Previous platform and Runner units restored; credentials and workspaces unchanged");
}
if (mode === "activate") {
  assert.equal(property("vibehard.service", "WorkingDirectory"), previous);
  idle(); verify(3211);
  assert.ok(!existsSync(backup), "Refusing to overwrite an existing rollback backup");
  mkdirSync(backup, { mode: 0o700 });
  copyFileSync(platformUnit, `${backup}/vibehard.service`);
  copyFileSync(runnerUnit, `${backup}/vibehard-runner.service`);
  const protectedPids = ["vibehard-gateway.service", "vibeboard.service"].map(service => [service, property(service, "MainPID")]);
  // Stop admission before the second idle check, then stop only the idle cloud Runner.
  run("systemctl", ["stop", "vibehard.service"]);
  try { idle(); } catch (error) { run("systemctl", ["start", "vibehard.service"]); cleanup(); throw error; }
  try {
    run("systemctl", ["stop", "vibehard-runner.service"]);
    writeFileSync(platformUnit, readFileSync(platformUnit, "utf8").replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${release}/standalone`));
    writeFileSync(runnerUnit, readFileSync(runnerUnit, "utf8").replace(/^ExecStart=.*$/m, `Environment=RUNNER_ENGINEERING_WORKFLOW=true\nExecStart=/opt/vibehard/toolchain/bin/node ${release}/services/runner.cjs`));
    run("systemctl", ["daemon-reload"]);
    const activatedAt = new Date().toISOString();
    run("systemctl", ["start", "vibehard.service", "vibehard-runner.service"]);
    await ready(3210); verify(3210);
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      healthy = query(`select count(*) from runner_nodes where runner_key='cloud-runner' and status='online' and last_heartbeat_at > '${activatedAt}'::timestamptz and last_heartbeat_at > now()-interval '30 seconds'`) === "1";
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(healthy, "No fresh cloud Runner heartbeat after activation");
    assert.equal(property("vibehard-runner.service", "ActiveState"), "active");
    for (const [service, pid] of protectedPids) assert.equal(property(service, "MainPID"), pid);
    console.log("Engineering workflow activated; fresh Runner heartbeat; Gateway/VibeBoard unchanged");
  } catch (error) { await restore(); throw error; }
  finally { cleanup(); }
}
