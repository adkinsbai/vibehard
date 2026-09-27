// Root-only staged release. No model/Runner credentials, protected services or
// corpus are changed. Additive diagnostics survive rollback.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const release = '/opt/vibehard/releases/20260927-design-reliability-v1';
const oldPlatform = '/opt/vibehard/releases/20260926-board-spec-v2/standalone';
const oldWorker = '/opt/vibehard/releases/20260927-rag-board-links-v1';
const node = '/opt/vibehard/runtime/node-v22.23.1';
const backup = `${release}/backup`; const preview = 'vibehard-design-reliability-preflight';
const platformUnit = '/etc/systemd/system/vibehard.service'; const workerUnit = '/etc/systemd/system/vibehard-design-worker.service';
const mode = process.argv[2]; assert.equal(process.getuid(), 0); assert.ok(['preflight', 'backup', 'migrate', 'activate', 'rollback', 'cleanup'].includes(mode));
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/vibehard');
const run = (command, args, options = {}) => { const r = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, ...options }); assert.equal(r.status, 0, `Failed ${command} ${args[0] ?? ''}; details suppressed`); return r.stdout.trim(); };
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const property = (unit, key) => run('systemctl', ['show', unit, '-p', key, '--value']);
const url = new URL(process.env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'vibehard' };
const query = (sql, env = pgEnv) => run('/usr/bin/psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env });
const idle = () => { assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"), '0', 'Active designs'); assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), '0', 'Active Agent turns'); };
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`, 'utf8'));
assert.equal(manifest.stage, 'reliability');
for (const [file, sha] of Object.entries(manifest.sourceSha256)) assert.equal(hash(`${release}/source/${file}`), sha, file);
for (const [file, sha] of Object.entries(manifest.artifacts)) assert.equal(hash(`${release}/services/${file}`), sha, file);
function acceptance() {
  assert.equal(property('vibehard-design-acceptance-20260927-v4', 'ExecMainStatus'), '0', 'Model acceptance failed');
  assert.notEqual(property('vibehard-design-acceptance-20260927-v4', 'ActiveState'), 'active', 'Model acceptance still running');
  const rows = run('journalctl', ['-u', 'vibehard-design-acceptance-20260927-v4', '--no-pager', '-o', 'cat']).split('\n').filter(x => x.startsWith('{')).map(x => JSON.parse(x));
  const summary = rows.find(x => x.acceptance === 'design-reliability-v1');
  assert.ok(summary?.passed && summary.total === 12 && summary.failures === 0, '12/12 real model gate not passed');
  const cases = rows.filter(x => x.case); assert.equal(cases.length, 12);
  for (const kind of ['no-match', 'reviewed', 'auto-indexed']) assert.equal(cases.filter(x => x.case === kind && x.passed && x.elapsedMs < 90000 && x.diagnostics?.requestPolicy === 'deepseek-draft-low-v2').length, 4);
  return rows;
}
async function ready(port) { for (let n = 0; n < 30; n++) { try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {} await new Promise(r => setTimeout(r, 1000)); } throw new Error('Candidate not ready'); }
function verify(port, env = process.env) { console.log(run(node, [`${release}/source/scripts/verify-frontend-release.mjs`, `http://127.0.0.1:${port}`, `${release}/standalone`], { env })); }
function cleanup() { spawnSync('systemctl', ['stop', preview]); spawnSync('systemctl', ['reset-failed', preview]); }
async function restore() {
  for (const [unit, name] of [[platformUnit, 'vibehard.service'], [workerUnit, 'vibehard-design-worker.service']]) copyFileSync(`${backup}/${name}`, unit);
  run('systemctl', ['daemon-reload']); run('systemctl', ['restart', 'vibehard-design-worker.service', 'vibehard.service']); await ready(3210);
}
if (mode === 'cleanup') cleanup();
if (mode === 'preflight') {
  acceptance(); assert.equal(property('vibehard.service', 'WorkingDirectory'), oldPlatform);
  const lines = readFileSync('/opt/vibehard/test-state/20260927-design-reliability/vibehard_reliability_test.env', 'utf8').trim().split('\n');
  const env = Object.fromEntries(lines.map(line => { const p = line.indexOf('='); return [line.slice(0, p), line.slice(p + 1)]; }));
  const test = new URL(env.DATABASE_URL); assert.equal(test.pathname, '/vibehard_reliability_test'); test.port = '5432'; env.DATABASE_URL = test.toString();
  mkdirSync(`${release}/evidence`, { recursive: true, mode: 0o700 });
  writeFileSync(`${release}/evidence/candidate.env`, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
  run('systemd-run', [`--unit=${preview}`, `--property=WorkingDirectory=${release}/standalone`, `--property=EnvironmentFile=${release}/evidence/candidate.env`, '--property=MemoryMax=768M', '--property=CPUQuota=100%', '--setenv=HOSTNAME=127.0.0.1', '--setenv=PORT=3211', '--setenv=NODE_ENV=production', node, 'server.js']);
  try {
    await ready(3211); verify(3211, { ...process.env, ...env });
    const testPg = { ...pgEnv, PGUSER: test.username, PGPASSWORD: test.password, PGDATABASE: 'vibehard_reliability_test' };
    const actor = JSON.parse(query("select row_to_json(u) from (select id,email,name,role from users where email like 'design-acceptance-%@example.invalid' order by created_at desc limit 1) u", testPg));
    const payload = Buffer.from(JSON.stringify({ ...actor, exp: Date.now() + 60000 })).toString('base64url');
    const cookie = `vibehard_session=${payload}.${createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url')}`;
    const fetchAs = path => fetch(`http://127.0.0.1:3211/vibehard${path}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000) });
    assert.equal((await fetchAs('/api/admin/design-diagnostics')).status, 403);
    const response = await fetchAs('/api/design'); assert.equal(response.status, 200);
    const listing = await response.json(); assert.equal(listing.jobs.length, 12); assert.ok(listing.jobs.every(j => j.status === 'completed' && j.diagnostics?.phases?.length === 6));
    writeFileSync(`${release}/evidence/preflight.json`, JSON.stringify({ passed: true, at: new Date().toISOString(), modelAcceptance: acceptance(), protectedFrontend: true, memberDiagnostics: 403, durableJobs: 12 }), { mode: 0o600 });
    console.log(JSON.stringify({ candidate: 'passed', isolatedDatabase: true, protectedFrontend: true }));
  } catch (error) { cleanup(); throw error; }
}
if (mode === 'backup') {
  idle(); assert.equal(property('vibehard.service', 'WorkingDirectory'), oldPlatform); assert.ok(!existsSync(backup));
  mkdirSync(backup, { mode: 0o700 }); copyFileSync(platformUnit, `${backup}/vibehard.service`); copyFileSync(workerUnit, `${backup}/vibehard-design-worker.service`);
  run('/usr/bin/pg_dump', ['-Fc', '-f', `${backup}/platform.dump`, 'vibehard'], { env: pgEnv });
  assert.ok(run('/usr/bin/pg_restore', ['--list', `${backup}/platform.dump`]).includes('TABLE DATA public users'));
  writeFileSync(`${backup}/BACKUP.json`, JSON.stringify({ sha256: hash(`${backup}/platform.dump`), at: new Date().toISOString() }), { mode: 0o600 }); console.log('Backup verified');
}
if (mode === 'migrate') {
  acceptance(); idle(); assert.equal(hash(`${backup}/platform.dump`), JSON.parse(readFileSync(`${backup}/BACKUP.json`)).sha256);
  assert.ok(JSON.parse(readFileSync(`${release}/evidence/preflight.json`)).passed);
  run(node, [`${release}/services/migrate.cjs`], { cwd: `${release}/source`, env: process.env }); console.log('Additive production migration applied');
}
if (mode === 'activate') {
  acceptance(); idle(); assert.equal(property('vibehard.service', 'WorkingDirectory'), oldPlatform);
  assert.equal(query("select count(*) from information_schema.columns where table_name='design_jobs' and column_name='diagnostics'"), '1');
  assert.ok(JSON.parse(readFileSync(`${release}/evidence/preflight.json`)).passed);
  const protectedUnits = ['vibehard-runner.service', 'vibehard-gateway.service', 'vibeboard.service', 'vibehard-eda-manager.service'];
  const pids = protectedUnits.map(unit => [unit, property(unit, 'MainPID')]);
  const configs = ['/etc/vibehard/platform.env', '/etc/vibehard/runner.env', '/etc/vibehard/model.env', '/etc/vibehard/eda-platform.env'].filter(existsSync).map(file => [file, hash(file)]);
  const modelBefore = createHash('sha256').update(query('select purpose,revision,encrypted_api_key from llm_settings order by purpose')).digest('hex');
  const nginx = run('docker', ['inspect', 'nginx', '--format', '{{.State.Pid}}']);
  run('systemctl', ['stop', 'vibehard.service']);
  try {
    idle(); run('systemctl', ['stop', 'vibehard-design-worker.service']);
    const platform = readFileSync(platformUnit, 'utf8'); const worker = readFileSync(workerUnit, 'utf8');
    assert.ok(platform.includes(oldPlatform) && worker.includes(oldWorker));
    writeFileSync(platformUnit, platform.replace(oldPlatform, `${release}/standalone`)); writeFileSync(workerUnit, worker.replaceAll(oldWorker, release));
    run('systemctl', ['daemon-reload']); run('systemctl', ['start', 'vibehard-design-worker.service', 'vibehard.service']);
    await ready(3210); verify(3210);
    const pid = property('vibehard-design-worker.service', 'MainPID'); await new Promise(r => setTimeout(r, 8000));
    assert.ok(Number(pid)); assert.equal(property('vibehard-design-worker.service', 'MainPID'), pid);
    for (const [unit, pid] of pids) assert.equal(property(unit, 'MainPID'), pid, unit);
    for (const [file, sha] of configs) assert.equal(hash(file), sha, file);
    assert.equal(run('docker', ['inspect', 'nginx', '--format', '{{.State.Pid}}']), nginx);
    assert.equal(createHash('sha256').update(query('select purpose,revision,encrypted_api_key from llm_settings order by purpose')).digest('hex'), modelBefore);
    assert.equal(query("select count(*) from runner_nodes where runner_key='cloud-runner' and last_heartbeat_at > now()-interval '90 seconds' and status in ('online','busy')"), '1', 'Cloud Runner heartbeat stale');
    assert.ok(run('ss', ['-Htn', 'state', 'established', '( sport = :8787 )']).length > 0, 'No live Gateway connection');
    console.log(run(node, [`${release}/source/scripts/verify-frontend-release.mjs`, 'https://ldcx.tech', `${release}/standalone`]));
    console.log(JSON.stringify({ activated: manifest.release, modelAndProtectedServicesUnchanged: true, rollback: `${release}/source/scripts/deploy-design-reliability.mjs rollback` }));
  } catch (error) { await restore(); throw error; } finally { cleanup(); }
}
if (mode === 'rollback') { idle(); await restore(); cleanup(); console.log('Previous platform and Worker restored; additive diagnostics retained'); }
