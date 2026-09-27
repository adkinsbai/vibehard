// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { atomicControl, evaluateBatch, fileHash, lockControl, registerBatch, requireBatchAdministrator, selectedBatch, transitionBatch, validateBatchPackage } from '@/lib/server/knowledge-batch-control';
import { closeIndexedKnowledge, searchIndexedKnowledge } from '@/lib/server/oss-knowledge-index';
import { indexPolicy } from '@/lib/server/retrieval-daemon';
import type { BatchManifest } from '@/lib/server/knowledge-batch-policy';

const roots: string[] = [];
afterEach(() => { closeIndexedKnowledge(); delete process.env.VIBEHARD_DISABLED_SOURCES_FILE; for (const p of roots.splice(0)) rmSync(p, { recursive: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vibehard-batch-test-')); roots.push(root);
  const staging = join(root, 'staging'); mkdirSync(staging); const index = join(staging, 'knowledge-fts.sqlite'); const id = randomUUID(); const sha = 'a'.repeat(64);
  const db = new DatabaseSync(index); db.exec('CREATE TABLE chunks(id TEXT,source_sha TEXT,source_path TEXT,category TEXT,page INTEGER,part INTEGER,method TEXT,text TEXT); CREATE VIRTUAL TABLE chunks_fts USING fts5(text,source_path,content="chunks",content_rowid="rowid",tokenize="trigram")');
  db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?)').run('b'.repeat(64),sha,'boards/ESP32-S3-Touch-LCD-2.8C/schematic.pdf','schematics',3,1,'embedded_text','ESP32-S3-Touch-LCD-2.8C schematic USB reference only. Not electrically verified.');
  db.exec("INSERT INTO chunks_fts(rowid,text,source_path) SELECT rowid,text,source_path FROM chunks"); db.close();
  const manifest: BatchManifest = { schema:'vibehard-controlled-index/v2', batchId:id, version:2, sqliteSha256:fileHash(index), indexedChunks:1, createdAt:'2026-09-27T00:00:00.000Z', reviewMethod:'automatic_rules_v1', manualReview:false,
    sources:[{sha256:sha,path:'boards/ESP32-S3-Touch-LCD-2.8C/schematic.pdf',aliases:['boards/ESP32-S3-Touch-LCD-2.8C/schematic.pdf'],rawObjects:[{key:`knowledge/raw/v1/${id}/asset/sha`,sha256:sha}],status:'auto_approved_for_index',flags:[],boards:['ESP32-S3-Touch-LCD-2.8C'],families:['ESP32-S3'],category:'schematics'}],probes:[{query:'ESP32-S3-Touch-LCD-2.8C schematic',expectedSha256:sha}] };
  const save = () => { writeFileSync(`${index}.manifest.json`,JSON.stringify(manifest)); const hash = fileHash(`${index}.manifest.json`); writeFileSync(`${index}.meta.json`,JSON.stringify({ schema:manifest.schema,batchId:id,sqliteSha256:manifest.sqliteSha256,indexedChunks:1,manifestSha256:hash })); return hash; };
  return {root,staging,index,id,sha,manifest,save,hash:save()};
}
describe('controlled shared ingestion', () => {
  it('restores the previous pointer and process when activation health fails; supports explicit rollback', async () => {
    const f = fixture(); const previous = {id:'legacy',path:'/legacy/index'}; const target = {id:f.id,path:f.index,manifestHash:f.hash}; atomicControl(join(f.root,'current.json'),previous);
    const restarts: string[] = [];
    await expect(transitionBatch(f.root,target,randomUUID(),'activate',async path => { restarts.push(path); if (path === f.index) throw Error('health failed'); })).rejects.toThrow('health failed');
    expect(restarts).toEqual([f.index,previous.path]); expect(JSON.parse(readFileSync(join(f.root,'current.json'),'utf8'))).toEqual(previous);
    await transitionBatch(f.root,target,randomUUID(),'activate',async () => {});
    await transitionBatch(f.root,previous,randomUUID(),'rollback',async () => {});
    expect(JSON.parse(readFileSync(join(f.root,'current.json'),'utf8'))).toEqual(previous);
  });
  it('requires a real administrator role, not developer/member or missing actor', () => {
    for (const role of ['member','developer','admin-ish']) expect(() => requireBatchAdministrator({id:randomUUID(),role})).toThrow('ADMIN_REQUIRED');
    expect(() => requireBatchAdministrator(undefined)).toThrow(); expect(() => requireBatchAdministrator({id:randomUUID(),role:'admin'})).not.toThrow();
  });
  it('registers immutably, evaluates hash/location provenance and gates version selection', async () => {
    const f = fixture(); await validateBatchPackage(f.index,f.hash);
    const path = registerBatch(f.root,f.staging,f.hash,randomUUID());
    expect(() => selectedBatch(f.root,f.id)).toThrow(); expect(() => registerBatch(f.root,f.staging,f.hash,randomUUID())).toThrow();
    const result = await evaluateBatch(path,f.hash); expect(result.p95Ms).toBeLessThan(500); expect(result.requests).toBe(60);
    atomicControl(join(f.root,'batches',f.id,'evaluation.json'),result);
    expect(selectedBatch(f.root,f.id).path).toBe(path);
    const refs = await searchIndexedKnowledge('ESP32-S3-Touch-LCD-2.8C schematic',path);
    expect(refs[0].version.source).toContain('#page=3&part=1'); expect(refs[0].reviewStatus).toBe('auto-indexed');
    expect(refs[0].version.version).toBe(2);
  });
  it('rejects tampered manifest/index, links, quarantine chunks and board variants', async () => {
    const f = fixture(); expect(await searchIndexedKnowledge('ESP32-S3-Touch-LCD-2.8D schematic',f.index)).toEqual([]);
    expect(await searchIndexedKnowledge('RV1106 USB schematic',f.index)).toEqual([]);
    closeIndexedKnowledge(); f.manifest.sources[0].status = 'quarantine'; f.manifest.sources[0].flags = ['possible_secret'];
    await expect(validateBatchPackage(f.index,f.save())).rejects.toThrow('CHUNK_POLICY_MISMATCH');
    await expect(validateBatchPackage(f.index,'e'.repeat(64))).rejects.toThrow('checksum');
    const linked = join(f.root,'linked'); mkdirSync(linked); symlinkSync(f.index,join(linked,'knowledge-fts.sqlite'));
    await expect(validateBatchPackage(join(linked,'knowledge-fts.sqlite'),f.hash)).rejects.toThrow('SYMLINK');
  });
  it('changes corpus revision on policy/disabled changes and serializes import operations', () => {
    const f = fixture(); const disabled = join(f.root,'disabled.json'); atomicControl(disabled,[]); process.env.VIBEHARD_DISABLED_SOURCES_FILE=disabled;
    const old = indexPolicy(f.index).revision; atomicControl(disabled,[f.sha]); expect(indexPolicy(f.index).revision).not.toBe(old);
    const disableRevision = indexPolicy(f.index).revision; const meta=JSON.parse(readFileSync(`${f.index}.meta.json`,'utf8')); meta.manifestSha256=createHash('sha256').update('new-policy').digest('hex'); atomicControl(`${f.index}.meta.json`,meta);
    expect(indexPolicy(f.index).revision).not.toBe(disableRevision);
    const unlock = lockControl(f.root); expect(() => lockControl(f.root)).toThrow(); unlock(); lockControl(f.root)();
  });
});
