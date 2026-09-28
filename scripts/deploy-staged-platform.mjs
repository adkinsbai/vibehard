// Versioned, two-stage September 28 release gate. No credential rotation or DB restore.
// Run as root with the existing platform + EDA environment files loaded by Node.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [release, mode] = process.argv.slice(2);
assert.equal(process.getuid(), 0);
assert.ok(["preflight", "backup", "activate", "rollback", "cleanup"].includes(mode));
assert.match(release ?? "", /^\/opt\/vibehard\/releases\/20260928-(?:audit-fixes|bom-pricing)-v1$/);
assert.equal(new URL(process.env.DATABASE_URL).pathname, "/vibehard");
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, "utf8"));
assert.equal(release, `/opt/vibehard/releases/${manifest.release}`);
assert.equal(manifest.stage === "audit" ? manifest.release : manifest.previousPlatform, "20260928-audit-fixes-v1");
const audit = manifest.stage === "audit";
const previousPlatform = `/opt/vibehard/releases/${manifest.previousPlatform}`;
const previousWorker = `/opt/vibehard/releases/${manifest.previousWorker}`;
const previousRetrieval = `/opt/vibehard/releases/${manifest.previousRetrieval}`;
const node = "/opt/vibehard/runtime/node-v22.23.1";
const candidate = `vibehard-${audit ? "audit" : "bom"}-preflight-20260928.service`;
const backup = `${release}/backup`;
const evidence = `${release}/evidence`;
const units = audit ? ["vibehard.service", "vibehard-design-worker.service", "vibehard-knowledge-retrieval.service"] : ["vibehard.service"];
const unitPath = name => `/etc/systemd/system/${name}`;
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 180_000, ...options });
  assert.equal(result.status, 0, `${command} ${args[0] ?? ""} failed; details suppressed`);
  return result.stdout.trim();
};
const property = (unit, key) => run("systemctl", ["show", "-p", key, "--value", unit]);
const db = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || "5432",
  PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: "vibehard" };
const query = sql => run("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env: pgEnv });
const idle = () => {
  assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"), "0", "Design jobs active");
  assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0", "Agent turns active");
};
function verifyPackage() {
  const oldManifest = JSON.parse(readFileSync(`${previousPlatform}/RELEASE.json`, "utf8"));
  assert.equal(oldManifest.release, manifest.previousPlatform);
  const protectedPaths = ["next.config.ts", "app/demo/", "public/demo/", "app/app/pcb/", "components/pcb/"];
  for (const [file, digest] of Object.entries(oldManifest.sourceSha256)) {
    assert.ok(manifest.sourceSha256[file], `Prior source missing from package: ${file}`);
    if (protectedPaths.some(prefix => file === prefix || file.startsWith(prefix))) assert.equal(manifest.sourceSha256[file], digest, `Protected source changed: ${file}`);
  }
  for (const [file, digest] of Object.entries(manifest.sourceSha256)) assert.equal(hash(`${release}/source/${file}`), digest, file);
  for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(`${release}/services/${file}`), digest, file);
  for (const [file, digest] of Object.entries(manifest.toolSha256)) assert.equal(hash(`${release}/scripts/${file}`), digest, file);
  assert.ok(readFileSync(`${release}/standalone/server.js`, "utf8").includes('basePath":"/vibehard"'));
}
async function ready(port) {
  for (let attempt = 0; attempt < 35; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Platform did not become ready on ${port}`);
}
function verify(origin) {
  console.log(run(node, [`${release}/scripts/verify-frontend-release.mjs`, origin, `${release}/standalone`]));
  if (!audit) console.log(run(node, [`${release}/scripts/verify-bom-release.mjs`, origin]));
}
function cleanup() {
  spawnSync("systemctl", ["stop", candidate]);
  spawnSync("systemctl", ["reset-failed", candidate]);
}
function expectedActive() {
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${previousPlatform}/standalone`);
  if (audit) {
    assert.equal(property("vibehard-design-worker.service", "WorkingDirectory"), previousWorker);
    assert.equal(property("vibehard-knowledge-retrieval.service", "WorkingDirectory"), previousRetrieval);
  }
}
async function restore() {
  for (const name of units) run("systemctl", ["stop", name]);
  for (const name of units) copyFileSync(`${backup}/${name}`, unitPath(name));
  run("systemctl", ["daemon-reload"]);
  for (const name of [...units].reverse()) run("systemctl", ["start", name]);
  await ready(3210);
}

if (mode === "cleanup") cleanup();
if (mode === "preflight") {
  verifyPackage(); expectedActive();
  assert.notEqual(property(candidate, "ActiveState"), "active");
  run("systemd-run", [`--unit=${candidate.replace(/\.service$/, "")}`,
    `--property=WorkingDirectory=${release}/standalone`, "--property=EnvironmentFile=/etc/vibehard/platform.env",
    "--property=EnvironmentFile=/etc/vibehard/eda-platform.env", "--property=MemoryMax=768M", "--property=CPUQuota=100%",
    "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", "--setenv=NODE_ENV=production",
    "--setenv=VIBEHARD_RETRIEVAL_SOCKET=/run/vibehard-knowledge/search.sock", node, "server.js"]);
  try {
    await ready(3211); verify("http://127.0.0.1:3211");
    mkdirSync(evidence, { mode: 0o700 });
    writeFileSync(`${evidence}/preflight.json`, JSON.stringify({ passed: true, at: new Date().toISOString(), release: manifest.release }), { mode: 0o600 });
    console.log(JSON.stringify({ preflight: "passed", release: manifest.release }));
  } catch (error) { cleanup(); throw error; }
}
if (mode === "backup") {
  verifyPackage(); expectedActive(); idle();
  assert.ok(existsSync(`${evidence}/preflight.json`) && !existsSync(backup));
  mkdirSync(backup, { mode: 0o700 });
  for (const name of units) copyFileSync(unitPath(name), `${backup}/${name}`);
  run("/usr/bin/pg_dump", ["-Fc", "-f", `${backup}/platform.dump`, "vibehard"], { env: pgEnv });
  assert.ok(run("/usr/bin/pg_restore", ["--list", `${backup}/platform.dump`]).includes("TABLE DATA public users"));
  writeFileSync(`${backup}/BACKUP.json`, JSON.stringify({ sha256: hash(`${backup}/platform.dump`), at: new Date().toISOString() }), { mode: 0o600 });
  console.log(JSON.stringify({ backup: "verified", release: manifest.release }));
}
if (mode === "activate") {
  verifyPackage(); expectedActive(); idle();
  assert.ok(JSON.parse(readFileSync(`${evidence}/preflight.json`, "utf8")).passed);
  assert.equal(hash(`${backup}/platform.dump`), JSON.parse(readFileSync(`${backup}/BACKUP.json`, "utf8")).sha256);
  const protectedUnits = ["vibehard-runner.service", "vibehard-gateway.service", "vibeboard.service", "vibehard-eda-manager.service"];
  if (!audit) protectedUnits.push("vibehard-design-worker.service", "vibehard-knowledge-retrieval.service");
  const protectedPids = protectedUnits.map(name => [name, property(name, "MainPID")]);
  const nginxPid = run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]);
  const configs = ["/etc/vibehard/platform.env", "/etc/vibehard/eda-platform.env", "/etc/vibehard/runner.env", "/etc/vibehard/model.env"]
    .filter(existsSync).map(file => [file, hash(file)]);
  try {
    idle();
    for (const name of units) run("systemctl", ["stop", name]);
    for (const name of units) {
      const old = readFileSync(`${backup}/${name}`, "utf8");
      const oldRelease = name === "vibehard.service" ? previousPlatform : name === "vibehard-design-worker.service" ? previousWorker : previousRetrieval;
      assert.ok(old.includes(oldRelease), `Unexpected existing unit: ${name}`);
      writeFileSync(unitPath(name), old.replaceAll(oldRelease, release), { mode: 0o644 });
    }
    run("systemctl", ["daemon-reload"]);
    for (const name of [...units].reverse()) run("systemctl", ["start", name]);
    await ready(3210);
    await new Promise(resolve => setTimeout(resolve, 5000));
    for (const name of units) {
      assert.equal(property(name, "ActiveState"), "active", name);
      assert.equal(property(name, "NRestarts"), "0", name);
    }
    verify("http://127.0.0.1:3210"); verify("https://ldcx.tech");
    for (const [name, pid] of protectedPids) assert.equal(property(name, "MainPID"), pid, `Protected service changed: ${name}`);
    assert.equal(run("docker", ["inspect", "nginx", "--format", "{{.State.Pid}}"]), nginxPid);
    for (const [file, digest] of configs) assert.equal(hash(file), digest, `Configuration changed: ${file}`);
    assert.equal(property("vibehard.service", "WorkingDirectory"), `${release}/standalone`);
    console.log(JSON.stringify({ activated: manifest.release, rollback: `${release}/scripts/deploy-staged-platform.mjs ${release} rollback` }));
  } catch (error) {
    await restore();
    console.error("Activation failed; prior unit(s) restored.");
    throw error;
  } finally { cleanup(); }
}
if (mode === "rollback") {
  idle();
  assert.equal(property("vibehard.service", "WorkingDirectory"), `${release}/standalone`);
  await restore(); cleanup();
  console.log(JSON.stringify({ rolledBackTo: manifest.previousPlatform }));
}
