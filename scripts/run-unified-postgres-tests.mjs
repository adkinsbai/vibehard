import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const ssh = ['-o', 'UseKeychain=yes', '-o', 'BatchMode=yes', '-i', '/Users/hushaohong/.ssh/ldcx_vibeboard_deploy', 'root@47.102.197.71'];
for (const [database, tests] of [
  ['vibehard_design_test', ['__tests__/design-postgres.test.ts', '__tests__/store-postgres.test.ts', '__tests__/knowledge-postgres.test.ts']],
  ['vibehard_rag_test', ['__tests__/shared-knowledge-postgres.test.ts']],
]) {
  // Credentials only in memory/environment, never command arguments or logs.
  const raw = execFileSync('ssh', [...ssh, `cat /opt/vibehard/test-state/20260925-rag-proof/${database}.env`], { encoding: 'utf8' });
  const env = Object.fromEntries(raw.trim().split('\n').map(line => { const p = line.indexOf('='); return [line.slice(0, p), line.slice(p + 1)]; }));
  const url = new URL(env.DATABASE_URL); assert.equal(url.pathname, `/${database}`); assert.equal(url.username, database); assert.equal(url.hostname, '127.0.0.1'); url.port = '15432';
  const result = spawnSync('node_modules/.bin/vitest', ['run', ...tests, '--maxWorkers=1', '--testTimeout=30000'], { env: { ...process.env, ...env, DATABASE_URL: url.toString(), VIBEHARD_DESIGN_TEST_DATABASE: '1', VIBEHARD_RAG_TEST_DATABASE: '1', DEFAULT_RUNNER_KEY: 'local-runner' }, stdio: 'inherit' });
  assert.equal(result.status, 0);
}
