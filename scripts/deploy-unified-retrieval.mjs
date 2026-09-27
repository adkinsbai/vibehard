import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const release = '/opt/vibehard/releases/20260927-unified-retrieval-v1'; const previous = '/opt/vibehard/releases/20260927-design-reliability-v1';
const node = '/opt/vibehard/runtime/node-v22.23.1'; const backup = `${release}/backup`; const preview = 'vibehard-unified-preflight';
const socket = '/run/vibehard-knowledge/search.sock'; const index = '/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite';
const unitNames = ['vibehard.service', 'vibehard-design-worker.service', 'vibehard-runner.service'];
const mode = process.argv[2]; assert.ok(['preflight', 'backup', 'activate', 'rollback', 'cleanup'].includes(mode)); assert.equal(process.getuid(), 0);
const db = new URL(process.env.DATABASE_URL); assert.equal(db.pathname, '/vibehard');
const run = (cmd, args, options = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 180000, ...options }); assert.equal(r.status, 0, `${cmd} ${args[0]} failed; details suppressed`); return r.stdout.trim(); };
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const prop = (unit, name) => run('systemctl', ['show', unit, '-p', name, '--value']);
const pgEnv = { ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: 'vibehard' };
const query = sql => run('/usr/bin/psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: pgEnv });
const idle = () => { assert.equal(query("select count(*) from design_jobs where status in ('queued','running')"), '0'); assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), '0'); };
const manifest = JSON.parse(readFileSync(`${release}/RELEASE.json`)); assert.equal(manifest.stage, 'unified-retrieval');
for (const [file, sha] of Object.entries(manifest.sourceSha256)) assert.equal(hash(`${release}/source/${file}`), sha, file);
for (const [file, sha] of Object.entries(manifest.artifacts)) assert.equal(hash(`${release}/services/${file}`), sha, file);
function gate(unit, name) {
  assert.equal(prop(unit, 'ExecMainStatus'), '0'); assert.notEqual(prop(unit, 'ActiveState'), 'active');
  const rows = run('journalctl', ['-u', unit, '--no-pager', '-o', 'cat']).split('\n').filter(x => x.startsWith('{')).map(x => JSON.parse(x));
  const summary = rows.find(x => x.acceptance === name); assert.ok(summary?.passed); return summary;
}
function gates() {
  const agent = gate('vibehard-agent-retrieval-acceptance-20260927-v2', 'agent-retrieval-v1');
  const load = gate('vibehard-retrieval-load-20260927', 'private-retrieval-load-v1');
  assert.equal(query("select revision from llm_settings where purpose='agent'"), agent.revision, 'Agent model changed since test');
  assert.ok(load.p95Ms < 500 && load.requests === 60);
  assert.ok(Number(prop('vibehard-retrieval-candidate-20260927-v2', 'MemoryPeak')) < 384 * 1024 ** 2);
  return { agent, load };
}
async function ready(port) { for (let n = 0; n < 30; n++) { try { if ((await fetch(`http://127.0.0.1:${port}/vibehard/login`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {} await new Promise(r => setTimeout(r, 1000)); } throw Error('Candidate not ready'); }
function verify(port, env = process.env) { console.log(run(node, [`${release}/source/scripts/verify-frontend-release.mjs`, `http://127.0.0.1:${port}`, `${release}/standalone`], { env })); }
function cleanup() { spawnSync('systemctl', ['stop', preview]); }
async function restore() {
  for (const name of unitNames) copyFileSync(`${backup}/${name}`, `/etc/systemd/system/${name}`);
  run('systemctl', ['daemon-reload']); run('systemctl', ['restart', ...unitNames]); await ready(3210);
  run('systemctl', ['stop', 'vibehard-knowledge-retrieval']);
}
if (mode === 'cleanup') cleanup();
if (mode === 'preflight') {
  const evidence = gates(); assert.equal(prop('vibehard.service', 'WorkingDirectory'), `${previous}/standalone`);
  const envPath = '/opt/vibehard/test-state/20260927-design-reliability/vibehard_reliability_test.env';
  const env = Object.fromEntries(readFileSync(envPath, 'utf8').trim().split('\n').map(line => { const p = line.indexOf('='); return [line.slice(0, p), line.slice(p + 1)]; }));
  const test = new URL(env.DATABASE_URL); assert.equal(test.pathname, '/vibehard_reliability_test'); test.port = '5432'; env.DATABASE_URL = test.toString();
  mkdirSync(`${release}/evidence`, { mode: 0o700 }); writeFileSync(`${release}/evidence/candidate.env`, Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
  run('systemd-run', [`--unit=${preview}`, `--property=WorkingDirectory=${release}/standalone`, `--property=EnvironmentFile=${release}/evidence/candidate.env`, '--property=MemoryMax=768M', '--property=CPUQuota=100%', '--setenv=HOSTNAME=127.0.0.1', '--setenv=PORT=3211', '--setenv=NODE_ENV=production', '--setenv=VIBEHARD_RETRIEVAL_SOCKET=/run/vibehard-retrieval-candidate/search.sock', node, 'server.js']);
  try { await ready(3211); verify(3211, { ...process.env, ...env }); writeFileSync(`${release}/evidence/preflight.json`, JSON.stringify({ passed: true, ...evidence }), { mode: 0o600 }); console.log('Unified candidate passed'); } catch (e) { cleanup(); throw e; }
}
if (mode === 'backup') {
  gates(); idle(); assert.ok(!existsSync(backup)); mkdirSync(backup, { mode: 0o700 });
  for (const name of unitNames) copyFileSync(`/etc/systemd/system/${name}`, `${backup}/${name}`);
  run('/usr/bin/pg_dump', ['-Fc', '-f', `${backup}/platform.dump`, 'vibehard'], { env: pgEnv });
  assert.ok(run('/usr/bin/pg_restore', ['--list', `${backup}/platform.dump`]).includes('TABLE DATA public users'));
  writeFileSync(`${backup}/BACKUP.json`, JSON.stringify({ sha256: hash(`${backup}/platform.dump`), at: new Date().toISOString() }), { mode: 0o600 }); console.log('Unified backup verified');
}
if (mode === 'activate') {
  gates(); idle(); assert.equal(prop('vibehard.service', 'WorkingDirectory'), `${previous}/standalone`);
  assert.ok(JSON.parse(readFileSync(`${release}/evidence/preflight.json`)).passed);
  assert.equal(hash(`${backup}/platform.dump`), JSON.parse(readFileSync(`${backup}/BACKUP.json`)).sha256);
  const protectedPids = ['vibeboard.service','vibehard-gateway.service','vibehard-eda-manager.service'].map(u => [u, prop(u, 'MainPID')]);
  const nginx = run('docker', ['inspect', 'nginx', '--format', '{{.State.Pid}}']);
  const secrets = ['/etc/vibehard/platform.env','/etc/vibehard/runner.env','/etc/vibehard/model.env','/var/lib/vibehard-runner/credential.json'].filter(existsSync).map(f => [f, hash(f)]);
  run('systemctl', ['stop', 'vibehard.service']);
  try {
    idle(); run('systemctl', ['stop', 'vibehard-design-worker.service', 'vibehard-runner.service']);
    if (spawnSync('getent', ['group', 'vibehard-retrieval']).status !== 0) run('groupadd', ['--system', 'vibehard-retrieval']);
    assert.ok(!existsSync('/etc/systemd/system/vibehard-knowledge-retrieval.service'));
    const template = readFileSync(`${release}/source/deploy/systemd/vibehard-knowledge-retrieval.service`, 'utf8').replaceAll('/opt/vibehard/current', release).replace('EnvironmentFile=/etc/vibehard/knowledge-index.env', `Environment=VIBEHARD_OSS_INDEX_PATH=${index}`);
    writeFileSync('/etc/systemd/system/vibehard-knowledge-retrieval.service', template);
    for (const name of unitNames) {
      let text = readFileSync(`${backup}/${name}`, 'utf8');
      if (name === 'vibehard-runner.service') { assert.ok(text.includes('/opt/vibehard/releases/20260919-project-knowledge/services/runner.cjs')); text = text.replace('/opt/vibehard/releases/20260919-project-knowledge/services/runner.cjs', `${release}/services/runner.cjs`); }
      else { assert.ok(text.includes(previous)); text = text.replaceAll(previous, release).replace('[Service]', `[Service]\nEnvironment=VIBEHARD_RETRIEVAL_SOCKET=${socket}`); }
      if (name === 'vibehard-design-worker.service') { text = text.replace(/^Environment=VIBEHARD_OSS_INDEX_PATH=.*\n/m, '').replace('SupplementaryGroups=vibehard-knowledge', 'SupplementaryGroups=vibehard-retrieval'); }
      writeFileSync(`/etc/systemd/system/${name}`, text);
    }
    run('systemctl', ['daemon-reload']); run('systemctl', ['enable','--now','vibehard-knowledge-retrieval']);
    run('systemctl', ['start', 'vibehard-runner.service','vibehard-design-worker.service','vibehard.service']); await ready(3210); verify(3210);
    for (let n = 0; n < 40; n++) { if (query("select count(*) from runner_nodes where runner_key='cloud-runner' and last_heartbeat_at > now()-interval '30 seconds' and capabilities @> '[\"bounded-retrieval-v1\"]'::jsonb") === '1') break; await new Promise(r => setTimeout(r, 1000)); }
    assert.equal(query("select count(*) from runner_nodes where runner_key='cloud-runner' and last_heartbeat_at > now()-interval '30 seconds' and capabilities @> '[\"bounded-retrieval-v1\"]'::jsonb"), '1');
    assert.ok(run('ss',['-Htn','state','established','( sport = :8787 )']).length);
    for (const [unit, pid] of protectedPids) assert.equal(prop(unit,'MainPID'),pid);
    for (const [file, sha] of secrets) assert.equal(hash(file),sha);
    assert.equal(run('docker',['inspect','nginx','--format','{{.State.Pid}}']),nginx);
    console.log(run(node,[`${release}/source/scripts/verify-frontend-release.mjs`,'https://ldcx.tech',`${release}/standalone`]));
    console.log(JSON.stringify({ activated: manifest.release, runnerCredentialUnchanged: true, privateSocket: socket, rollback: `${release}/source/scripts/deploy-unified-retrieval.mjs rollback` }));
  } catch (e) { await restore(); throw e; } finally { cleanup(); }
}
if (mode === 'rollback') { idle(); await restore(); cleanup(); console.log('Unified retrieval rolled back; previous platform, worker and Runner restored'); }
