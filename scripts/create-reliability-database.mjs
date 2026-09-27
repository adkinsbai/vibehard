// Dedicated to model acceptance; never shared with integration test queues.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
assert.equal(process.getuid(), 0);
const name = 'vibehard_reliability_test'; const dir = '/opt/vibehard/test-state/20260927-design-reliability';
function query(sql) { const r = spawnSync('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', cwd: '/tmp' }); assert.equal(r.status, 0, 'Isolated database operation failed'); return r.stdout.trim(); }
assert.ok(!existsSync(`${dir}/${name}.env`));
assert.equal(query(`select count(*) from pg_database where datname='${name}'`), '0');
assert.equal(query(`select count(*) from pg_roles where rolname='${name}'`), '0');
const password = randomBytes(32).toString('hex');
query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10;`);
query(`CREATE DATABASE ${name} OWNER ${name};`); query(`REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC;`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(`${dir}/${name}.env`, `DATABASE_URL=postgresql://${name}:${password}@127.0.0.1:5432/${name}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nDEFAULT_RUNNER_KEY=isolated-test\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ created: name, productionDataCopied: false }));
