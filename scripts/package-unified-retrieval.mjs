import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const name = '20260927-unified-retrieval-v1';
const prior = '/opt/vibehard/releases/20260927-design-reliability-v1';
const manifest = JSON.parse(execFileSync('ssh', ['-o', 'UseKeychain=yes', '-o', 'BatchMode=yes', '-i', '/Users/hushaohong/.ssh/ldcx_vibeboard_deploy', 'root@47.102.197.71', `cat ${prior}/RELEASE.json`], { encoding: 'utf8' }));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
// Preserve every published path, and byte-identical PCB/Demo/desktop surfaces.
for (const file of Object.keys(manifest.sourceSha256)) assert.ok(existsSync(file), `Missing published source: ${file}`);
for (const [file, sha] of Object.entries(manifest.sourceSha256)) if (/^(app\/demo|public\/demo|app\/app\/pcb|components\/pcb|services\/eda-desktop)\//.test(file) || file === 'next.config.ts') assert.equal(hash(file), sha);
assert.ok(readFileSync('.next/standalone/server.js', 'utf8').includes('basePath":"/vibehard"'));
const root = mkdtempSync('/private/tmp/vibehard-unified-release.'); const release = `${root}/${name}`; mkdirSync(release);
cpSync('.next/standalone', `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync('.next/static', `${release}/standalone/.next/static`, { recursive: true }); cpSync('public', `${release}/standalone/public`, { recursive: true });
for (const entry of readdirSync(`${release}/standalone/node_modules/.pnpm`).filter(x => x.startsWith('@swc+helpers@'))) {
  const source = `node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${release}/standalone/node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean); const sourceSha256 = {};
for (const file of new Set(files)) { assert.ok(!/^\.env(?:$|\.(?!example))/.test(file) && !file.startsWith('/') && !file.split('/').includes('..')); mkdirSync(path.dirname(`${release}/source/${file}`), { recursive: true }); copyFileSync(file, `${release}/source/${file}`); sourceSha256[file] = hash(file); }
mkdirSync(`${release}/services`); const artifacts = {};
for (const file of ['design-worker.cjs', 'runner.cjs', 'knowledge-retrieval.cjs', 'accept-agent-retrieval.cjs']) { copyFileSync(`dist/services/${file}`, `${release}/services/${file}`); artifacts[file] = hash(`dist/services/${file}`); }
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name, stage: 'unified-retrieval', git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), previousPlatform: manifest.release, previousWorker: manifest.release, previousRunner: '20260919-project-knowledge', sourceSha256, artifacts, databaseMigration: null }, null, 2));
const archive = `${root}/${name}.tar.gz`; execFileSync('tar', ['--no-xattrs', '-czf', archive, '-C', root, name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
console.log(JSON.stringify({ archive, sha256: hash(archive), sourceFiles: files.length, preservedPublishedFiles: Object.keys(manifest.sourceSha256).length }));
