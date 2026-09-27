// Frontend-only release gate. Run with the existing platform and EDA env files.
// Never changes the database, OSS/RAG index or any non-platform service unit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const release = '/opt/vibehard/releases/20260926-board-spec-v2';
const previous = '/opt/vibehard/releases/20260926-esp32-fts-v1';
const platform = '/etc/systemd/system/vibehard.service';
const backup = `${release}/backup`;
const preview = 'vibehard-board-spec-v2-preflight.service';
const node = '/opt/vibehard/runtime/node-v22.23.1';
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(['preflight', 'activate', 'rollback', 'cleanup'].includes(mode));
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/vibehard');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, ...options });
  assert.equal(result.status, 0, `Command failed: ${command} ${args[0] ?? ''}; ${result.stderr?.slice(0, 500) ?? ''}`);
  return result.stdout.trim();
}
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const property = (service, key) => run('systemctl', ['show', '-p', key, '--value', service]);
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, 'utf8'));
assert.equal(manifest.release, '20260926-board-spec-v2');
assert.equal(manifest.previousPlatform, '20260926-esp32-fts-v1');
assert.equal(manifest.deploymentScope, 'frontend-only');
assert.equal(manifest.activeSourceFilesPreserved, 976);
const oldManifest = JSON.parse(readFileSync(`${previous}/RELEASE.json`, 'utf8'));
assert.equal(oldManifest.release, manifest.previousPlatform);
for (const [file, hash] of Object.entries(manifest.sourceSha256)) {
  assert.equal(digest(`${release}/source/${file}`), hash, `Release source changed: ${file}`);
}
const allowed = new Set([...manifest.changedRuntime, ...manifest.newRuntime]);
const isRuntime = file => /^(?:app|components|lib|public|runner|gateway|drizzle)\//.test(file) ||
  ['package.json', 'pnpm-lock.yaml', 'next.config.ts', 'proxy.ts', 'instrumentation.ts'].includes(file);
for (const [file, hash] of Object.entries(oldManifest.sourceSha256)) {
  assert.equal(digest(`${previous}/source/${file}`), hash, `Active source changed: ${file}`);
  if (isRuntime(file) && !allowed.has(file)) assert.equal(manifest.sourceSha256[file], hash, `Protected runtime changed: ${file}`);
}
assert.deepEqual(manifest.changedRuntime, [
  'components/app/board-library.tsx', 'components/app/knowledge-library.tsx',
  'lib/board-catalog.ts', 'lib/knowledge-catalog.ts', 'lib/module-help.ts', 'lib/server/board-catalog.ts',
]);
assert.deepEqual(manifest.newRuntime, [
  'lib/server/data/board-catalog-evidence.json', 'lib/server/data/board-spec-evidence.json',
  'lib/server/verified-board-catalog.ts',
]);
for (const script of ['verify-frontend-release.mjs', 'verify-knowledge-library.mjs']) {
  assert.equal(digest(`${release}/scripts/${script}`), digest(`${release}/source/scripts/${script}`));
}

const database = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432',
  PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: 'vibehard' };
const query = sql => run('/usr/bin/psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: pgEnv });
function idle() {
  assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), '0', 'Agent turn active');
  assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"), '0', 'Design task active');
}
async function ready(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Platform readiness timeout on ${port}`);
}
function verify(origin) {
  for (const [script, args] of [
    ['verify-frontend-release.mjs', [origin, `${release}/standalone`]],
    ['verify-knowledge-library.mjs', [`${origin}/vibehard`]],
  ]) console.log(run(node, [`${release}/scripts/${script}`, ...args]));
}
function cleanup() {
  spawnSync('systemctl', ['stop', preview]);
  spawnSync('systemctl', ['reset-failed', preview]);
}
async function restore() {
  copyFileSync(`${backup}/vibehard.service`, platform);
  run('systemctl', ['daemon-reload']);
  run('systemctl', ['restart', 'vibehard.service']);
  await ready(3210);
}

if (mode === 'cleanup') cleanup();
if (mode === 'preflight') {
  assert.equal(property('vibehard.service', 'WorkingDirectory'), `${previous}/standalone`);
  assert.equal(property(preview, 'ActiveState'), 'inactive');
  run('systemd-run', ['--unit=vibehard-board-spec-v2-preflight', '--property=Type=simple',
    `--property=WorkingDirectory=${release}/standalone`, '--property=EnvironmentFile=/etc/vibehard/platform.env',
    '--property=EnvironmentFile=/etc/vibehard/eda-platform.env', '--property=MemoryMax=768M',
    '--property=CPUQuota=100%', '--setenv=HOSTNAME=127.0.0.1', '--setenv=PORT=3211',
    '--setenv=NODE_ENV=production', node, 'server.js']);
  try { await ready(3211); verify('http://127.0.0.1:3211'); }
  catch (error) { cleanup(); throw error; }
  console.log(JSON.stringify({ preflight: 'passed', candidate: release, candidatePort: 3211 }));
}
if (mode === 'activate') {
  assert.equal(property('vibehard.service', 'WorkingDirectory'), `${previous}/standalone`);
  assert.equal(property(preview, 'ActiveState'), 'active');
  idle(); verify('http://127.0.0.1:3211');
  assert.ok(!existsSync(backup));
  mkdirSync(backup, { mode: 0o700 });
  copyFileSync(platform, `${backup}/vibehard.service`);
  const protectedServices = ['vibehard-design-worker.service', 'vibehard-runner.service',
    'vibehard-gateway.service', 'vibeboard.service', 'vibehard-eda-manager.service'];
  const pids = protectedServices.map(service => [service, property(service, 'MainPID')]);
  const nginxPid = run('docker', ['inspect', 'nginx', '--format', '{{.State.Pid}}']);
  const configs = ['/etc/vibehard/platform.env', '/etc/vibehard/eda-platform.env',
    '/etc/vibehard/runner.env', '/etc/vibehard/model.env'].filter(existsSync).map(file => [file, digest(file)]);
  try {
    idle();
    const oldUnit = readFileSync(platform, 'utf8');
    assert.ok(oldUnit.includes(`WorkingDirectory=${previous}/standalone`));
    writeFileSync(platform, oldUnit.replace(`WorkingDirectory=${previous}/standalone`, `WorkingDirectory=${release}/standalone`));
    run('systemctl', ['daemon-reload']);
    run('systemctl', ['restart', 'vibehard.service']);
    await ready(3210);
    verify('http://127.0.0.1:3210');
    verify('https://ldcx.tech');
    for (const [service, pid] of pids) assert.equal(property(service, 'MainPID'), pid, `Protected service changed: ${service}`);
    assert.equal(run('docker', ['inspect', 'nginx', '--format', '{{.State.Pid}}']), nginxPid);
    for (const [file, hash] of configs) assert.equal(digest(file), hash, `Config changed: ${file}`);
    assert.equal(property('vibehard.service', 'WorkingDirectory'), `${release}/standalone`);
    console.log(JSON.stringify({ activated: manifest.release, release, protectedServicesUnchanged: true,
      configFilesUnchanged: true, publicVerification: true }));
  } catch (error) {
    await restore();
    console.error('Activation failed; prior platform unit restored.');
    throw error;
  } finally { cleanup(); }
}
if (mode === 'rollback') {
  idle();
  assert.equal(property('vibehard.service', 'WorkingDirectory'), `${release}/standalone`);
  await restore(); cleanup();
  console.log(JSON.stringify({ rolledBackTo: previous }));
}
