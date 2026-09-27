import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const name = '20260927-controlled-ingestion-v1'; const root = mkdtempSync('/private/tmp/vibehard-ingestion-release.'); const release = `${root}/${name}`;
const hash = f => createHash('sha256').update(readFileSync(f)).digest('hex');
const files = execFileSync('git', ['ls-files','-z'], { encoding:'utf8' }).split('\0').filter(Boolean); const sourceSha256 = {};
for (const file of files) { assert.ok(!/^\.env(?:$|\.(?!example))/.test(file)); mkdirSync(path.dirname(`${release}/source/${file}`),{recursive:true}); copyFileSync(file,`${release}/source/${file}`); sourceSha256[file]=hash(file); }
mkdirSync(`${release}/services`); const artifacts = {};
for (const file of ['knowledge-retrieval.cjs','knowledge-batch-control.cjs']) { copyFileSync(`dist/services/${file}`,`${release}/services/${file}`); artifacts[file]=hash(`dist/services/${file}`); }
writeFileSync(`${release}/RELEASE.json`,JSON.stringify({release:name,stage:'controlled-ingestion',git:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),previousRetrieval:'20260927-unified-retrieval-v1',platformUnchanged:'20260927-unified-retrieval-v1',sourceSha256,artifacts},null,2));
const archive=`${root}/${name}.tar.gz`;execFileSync('tar',['--no-xattrs','-czf',archive,'-C',root,name],{env:{...process.env,COPYFILE_DISABLE:'1'}});
console.log(JSON.stringify({archive,sha256:hash(archive),sourceFiles:files.length}));
