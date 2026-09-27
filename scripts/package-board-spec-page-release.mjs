// Build an immutable frontend-only candidate from the already-tested build.
// Compare every existing production runtime source hash before packaging so
// Demo, PCB, EDA and Agent overlays cannot silently regress.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = process.argv[2];
const activeManifestPath = process.argv[3];
assert.match(output ?? '', /^\/private\/tmp\/vibehard-board-spec-release\.[A-Za-z0-9]+$/);
assert.equal(activeManifestPath, '/private/tmp/vibehard-active-esp32-fts-release.json');
const name = '20260926-board-spec-v2';
const release = path.join(output, name);
assert.ok(!existsSync(release) && existsSync('.next/standalone/server.js'));
assert.ok(readFileSync('.next/standalone/server.js', 'utf8').includes('basePath":"/vibehard"'),
  'Production build must use NEXT_PUBLIC_BASE_PATH=/vibehard');
const active = JSON.parse(readFileSync(activeManifestPath, 'utf8'));
assert.equal(active.release, '20260926-esp32-fts-v1');
assert.equal(Object.keys(active.sourceSha256).length, 976);
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const changedRuntime = new Set([
  'components/app/board-library.tsx', 'components/app/knowledge-library.tsx',
  'lib/board-catalog.ts', 'lib/knowledge-catalog.ts', 'lib/module-help.ts',
  'lib/server/board-catalog.ts',
]);
const newRuntime = new Set([
  'lib/server/verified-board-catalog.ts', 'lib/server/data/board-catalog-evidence.json',
  'lib/server/data/board-spec-evidence.json',
]);
const isRuntime = file => /^(?:app|components|lib|public|runner|gateway|drizzle)\//.test(file) ||
  ['package.json', 'pnpm-lock.yaml', 'next.config.ts', 'proxy.ts', 'instrumentation.ts'].includes(file);
const actualChanged = [];
for (const [file, hash] of Object.entries(active.sourceSha256)) {
  assert.ok(existsSync(file), `Active release file absent locally: ${file}`);
  if (sha256(file) !== hash && isRuntime(file)) {
    assert.ok(changedRuntime.has(file), `Out-of-scope runtime change: ${file}`);
    actualChanged.push(file);
  }
}
assert.deepEqual(actualChanged.sort(), [...changedRuntime].sort());
for (const file of newRuntime) assert.ok(existsSync(file) && !active.sourceSha256[file]);

mkdirSync(release, { mode: 0o755 });
cpSync('.next/standalone', `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync('.next/static', `${release}/standalone/.next/static`, { recursive: true, verbatimSymlinks: true });
cpSync('public', `${release}/standalone/public`, { recursive: true, verbatimSymlinks: true });
const modules = `${release}/standalone/node_modules/.pnpm`;
for (const entry of readdirSync(modules).filter(item => item.startsWith('@swc+helpers@'))) {
  const source = `node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${modules}/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
const listed = spawnSync('git', ['ls-files', '-z'], { encoding: 'buffer' });
assert.equal(listed.status, 0);
const extra = [
  '__tests__/board-catalog-evidence.test.ts', 'docs/board-resource-audit-2026-09-26.json',
  'docs/board-spec-candidates-2026-09-26.json', 'docs/board-spec-release-task.md',
  'docs/board-spec-review-draft-2026-09-26.json', 'docs/board-spec-verification-2026-09-26.html',
  ...newRuntime, 'scripts/audit-board-resource-files.py', 'scripts/audit-board-spec-sources.mjs',
  'scripts/build-board-catalog-evidence.mjs', 'scripts/build-board-spec-candidates.mjs',
  'scripts/build-board-spec-evidence.mjs', 'scripts/draft-board-spec-review.mjs',
  'scripts/render-board-spec-report.mjs',
  'scripts/package-board-spec-page-release.mjs', 'scripts/deploy-board-spec-page.mjs',
];
const files = [...new Set([...listed.stdout.toString('utf8').split('\0').filter(Boolean), ...extra])].sort();
const hashes = {};
for (const file of files) {
  assert.ok(!file.startsWith('/') && !file.split('/').includes('..') && existsSync(file), file);
  mkdirSync(path.dirname(`${release}/source/${file}`), { recursive: true });
  copyFileSync(file, `${release}/source/${file}`);
  hashes[file] = sha256(file);
}
for (const file of ['app/demo/page.tsx', 'app/app/pcb/page.tsx',
  'components/pcb/pcb-preview.tsx', 'scripts/verify-frontend-release.mjs',
  'scripts/verify-knowledge-library.mjs', ...newRuntime]) assert.ok(hashes[file], file);
mkdirSync(`${release}/scripts`);
for (const file of ['verify-frontend-release.mjs', 'verify-knowledge-library.mjs', 'deploy-board-spec-page.mjs']) {
  copyFileSync(`scripts/${file}`, `${release}/scripts/${file}`);
}
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name,
  previousPlatform: active.release, previousWorker: active.release,
  deploymentScope: 'frontend-only', activeSourceFilesPreserved: Object.keys(active.sourceSha256).length,
  changedRuntime: [...changedRuntime].sort(), newRuntime: [...newRuntime].sort(),
  excluded: ['database migration', 'OSS', 'RAG index', 'design worker', 'Runner', 'Gateway', 'VibeBoard', 'EDA manager', 'nginx', 'model settings'],
  sourceSha256: hashes }, null, 2));
const archive = path.join(output, `vibehard-${name}.tar.gz`);
const tar = spawnSync('tar', ['--no-xattrs', '-czf', archive, '-C', output, name], { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
assert.equal(tar.status, 0);
console.log(JSON.stringify({ archive, sha256: sha256(archive), sourceFiles: files.length,
  changedRuntime: actualChanged.length, newRuntime: newRuntime.size }));
