import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const releaseName = '20260927-design-reliability-v1';
const active = JSON.parse(execFileSync('ssh', ['-o', 'UseKeychain=yes', '-o', 'BatchMode=yes', '-i', '/Users/hushaohong/.ssh/ldcx_vibeboard_deploy', 'root@47.102.197.71', 'cat /opt/vibehard/releases/20260926-board-spec-v2/RELEASE.json'], { encoding: 'utf8' }));
assert.equal(active.release, '20260926-board-spec-v2');
const changed = ['app/app/admin/page.tsx', 'components/app/design-workbench.tsx', 'drizzle/meta/_journal.json',
  'lib/agent/design-jobs.ts', 'lib/db/schema.ts', 'lib/server/design-job-store.ts', 'lib/server/design-job-worker.ts', 'lib/server/llm-client.ts',
  'lib/server/oss-knowledge-index.ts']; // Last entry is the already-live board-linked worker baseline.
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const [file, sha] of Object.entries(active.sourceSha256)) {
  assert.ok(existsSync(file), `Published source missing: ${file}`);
  if (/^(app|components|lib|public|runner|gateway|drizzle)\//.test(file) || ['package.json', 'pnpm-lock.yaml', 'next.config.ts', 'proxy.ts', 'instrumentation.ts'].includes(file)) {
    if (!changed.includes(file)) assert.equal(hash(file), sha, `Unexpected published runtime change: ${file}`);
  }
}
assert.ok(readFileSync('.next/standalone/server.js', 'utf8').includes('basePath":"/vibehard"'));
const root = mkdtempSync('/private/tmp/vibehard-reliability-release.'); const release = `${root}/${releaseName}`;
mkdirSync(release); cpSync('.next/standalone', `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync('.next/static', `${release}/standalone/.next/static`, { recursive: true }); cpSync('public', `${release}/standalone/public`, { recursive: true });
for (const entry of readdirSync(`${release}/standalone/node_modules/.pnpm`).filter(x => x.startsWith('@swc+helpers@'))) {
  const source = `node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${release}/standalone/node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const sourceSha256 = {};
for (const file of new Set(files)) {
  assert.ok(!file.startsWith('/') && !file.split('/').includes('..') && !/^\.env(?:$|\.(?!example))/.test(file));
  mkdirSync(path.dirname(`${release}/source/${file}`), { recursive: true }); copyFileSync(file, `${release}/source/${file}`); sourceSha256[file] = hash(file);
}
mkdirSync(`${release}/services`);
const artifacts = {};
for (const name of ['design-worker.cjs', 'migrate.cjs']) {
  copyFileSync(`dist/services/${name}`, `${release}/services/${name}`); artifacts[name] = hash(`dist/services/${name}`);
}
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: releaseName, git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  previousPlatform: active.release, previousWorker: '20260927-rag-board-links-v1', changedRuntime: changed, sourceSha256, artifacts,
  stage: 'reliability', additiveMigration: '0007_design_diagnostics', modelConfigChanged: false }, null, 2));
const archive = `${root}/${releaseName}.tar.gz`;
execFileSync('tar', ['--no-xattrs', '-czf', archive, '-C', root, releaseName], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
console.log(JSON.stringify({ archive, sha256: hash(archive), sourceFiles: files.length, publishedSourcePreserved: Object.keys(active.sourceSha256).length }));
