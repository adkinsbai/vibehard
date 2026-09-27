// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { atomicControl, evaluateBatch, fileHash, indexBuildId, lockControl, registerBatch, requireBatchAdministrator, selectedBatch, transitionBatch, validateBatchPackage } from '@/lib/server/knowledge-batch-control';
import { closeIndexedKnowledge, searchIndexedKnowledge } from '@/lib/server/oss-knowledge-index';
import { createRetrievalServer, indexPolicy, searchIndexSet } from '@/lib/server/retrieval-daemon';
import { queryPrivateIndex } from '@/lib/server/retrieval-client';
import type { BatchManifest } from '@/lib/server/knowledge-batch-policy';
import { activateInSet, ACTIVE_INDEX_BUDGET, checkIndexSetBudget, indexSet } from '@/lib/server/knowledge-index-set';

const roots: string[] = [];
afterEach(() => { closeIndexedKnowledge(); delete process.env.VIBEHARD_DISABLED_SOURCES_FILE; for (const p of roots.splice(0)) rmSync(p, { recursive: true }); });
function fixture(batchId = randomUUID(), version = 2, family = 'ESP32-S3') {
  const root = mkdtempSync(join(tmpdir(), 'vibehard-batch-test-')); roots.push(root);
  const staging = join(root, 'staging'); mkdirSync(staging); const index = join(staging, 'knowledge-fts.sqlite'); const id = batchId; const sha = createHash('sha256').update(family).digest('hex');
  const board=family==='ESP32-S3'?'ESP32-S3-Touch-LCD-2.8C':`${family}-EVB`; const source=`boards/${board}/schematic.pdf`;
  const db = new DatabaseSync(index); db.exec('CREATE TABLE chunks(id TEXT,source_sha TEXT,source_path TEXT,category TEXT,page INTEGER,part INTEGER,method TEXT,text TEXT); CREATE VIRTUAL TABLE chunks_fts USING fts5(text,source_path,content="chunks",content_rowid="rowid",tokenize="trigram")');
  db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?,?)').run('b'.repeat(64),sha,source,'schematics',3,1,'embedded_text',`${board} schematic USB reference only. Not electrically verified.`);
  db.exec("INSERT INTO chunks_fts(rowid,text,source_path) SELECT rowid,text,source_path FROM chunks"); db.close();
  const manifest: BatchManifest = { schema:'vibehard-controlled-index/v2', batchId:id, version, sqliteSha256:fileHash(index), indexedChunks:1, createdAt:'2026-09-27T00:00:00.000Z', reviewMethod:'automatic_rules_v1', manualReview:false,
    sources:[{sha256:sha,path:source,aliases:[source],rawObjects:[{key:`knowledge/raw/v1/${id}/asset/sha`,sha256:sha}],status:'auto_approved_for_index',flags:[],boards:[board],families:[family],category:'schematics'}],probes:[{query:`${board} schematic`,expectedSha256:sha}] };
  const save = () => { writeFileSync(`${index}.manifest.json`,JSON.stringify(manifest)); const hash = fileHash(`${index}.manifest.json`); writeFileSync(`${index}.meta.json`,JSON.stringify({ schema:manifest.schema,batchId:id,sqliteSha256:manifest.sqliteSha256,indexedChunks:1,manifestSha256:hash })); return hash; };
  return {root,staging,index,id,sha,manifest,save,hash:save()};
}
describe('controlled shared ingestion', () => {
  it('caps aggregate storage/handles and replaces the legacy raw batch without duplicating its sources', async () => {
    const f=fixture(); const raw='6cf96eea-af45-4e7d-96c0-c99afbe8c192';
    const replacement={id:`${raw}-v2`,batchId:raw,path:f.index};
    expect(activateInSet({id:'legacy-20260926',path:'/legacy'},replacement).indexes).toEqual([replacement]);
    const indexes=Array.from({length:5},(_,i)=>({id:randomUUID(),path:`/index/${i}`}));
    expect(()=>indexSet({schema:'vibehard-index-set/v1',indexes})).toThrow();
    expect(()=>indexSet({schema:'vibehard-index-set/v1',indexes:[replacement,{...replacement,path:'/duplicate'}]})).toThrow('DUPLICATE_ACTIVE_BATCH');
    const paths=Array.from({length:5},()=>fixture().index);
    const opened=await Promise.allSettled(paths.map(path=>searchIndexedKnowledge('ESP32-S3 schematic',path)));
    expect(opened.filter(x=>x.status==='fulfilled')).toHaveLength(4);
    expect(opened.filter(x=>x.status==='rejected')).toHaveLength(1);
    closeIndexedKnowledge();
    // Sparse files check accounting without allocating hundreds of MB of data.
    truncateSync(f.index,ACTIVE_INDEX_BUDGET+1);
    expect(()=>checkIndexSetBudget(indexSet(replacement))).toThrow('ACTIVE_INDEX_BUDGET_EXCEEDED');
  });
  it('retrieves old/new corpus concurrently through the private socket with bounded citations and revocation', async () => {
    const a=fixture(), b=fixture(randomUUID(),1,'RV1106'); const paths=[a.index,b.index];
    const directory=mkdtempSync('/private/tmp/index-set-test-'); roots.push(directory);
    const socket=join(directory,'test.sock'); const disabled=join(directory,'disabled.json'); atomicControl(disabled,[]);
    const oldSocket=process.env.VIBEHARD_RETRIEVAL_SOCKET;
    process.env.VIBEHARD_RETRIEVAL_SOCKET=socket; process.env.VIBEHARD_DISABLED_SOURCES_FILE=disabled;
    const server=createRetrievalServer(paths); await new Promise<void>(resolve=>server.listen(socket,resolve));
    try {
      const [esp,rv]=await Promise.all([queryPrivateIndex('ESP32-S3 schematic USB'),queryPrivateIndex('RV1106 schematic USB')]);
      expect(esp.sources.map(s=>s.version.sha256)).toEqual([a.sha]); expect(rv.sources.map(s=>s.version.sha256)).toEqual([b.sha]);
      expect(rv.sources[0].version.source).toContain('#page=3&part=1');
      const timings:number[]=[];
      for(let i=0;i<30;i++) await Promise.all(['ESP32-S3 schematic','RV1106 schematic'].map(async query=>{
        const start=performance.now(); const result=await queryPrivateIndex(query); timings.push(performance.now()-start);
        expect(result.sources).toHaveLength(1); expect(result.sources[0].reviewStatus).toBe('auto-indexed');
      }));
      timings.sort((x,y)=>x-y); expect(timings[56]).toBeLessThan(500);
      expect(process.memoryUsage().rss).toBeLessThan(384*1024**2);
      atomicControl(disabled,[a.sha]); const revoked=await queryPrivateIndex('ESP32-S3 schematic');
      expect(revoked.sources).toEqual([]); expect(revoked.revision).not.toBe(esp.revision);
      expect((await queryPrivateIndex('RV1106 schematic')).sources).toHaveLength(1);
      expect(await searchIndexSet('ESP32-S3-Unknown-Variant-999 schematic',paths,new Set())).toEqual([]);
    } finally {
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      if(oldSocket===undefined) delete process.env.VIBEHARD_RETRIEVAL_SOCKET; else process.env.VIBEHARD_RETRIEVAL_SOCKET=oldSocket;
    }
  });
  it('adds another raw batch and replaces only a matching batch version in the active set', async () => {
    const first = fixture(); const next = fixture(); const actor=randomUUID();
    const a={id:indexBuildId(first.manifest),batchId:first.id,path:first.index,manifestHash:first.hash};
    const b={id:indexBuildId(next.manifest),batchId:next.id,path:next.index,manifestHash:next.hash};
    atomicControl(join(first.root,'current.json'),a);
    await transitionBatch(first.root,b,actor,'activate',async()=>{});
    const active=JSON.parse(readFileSync(join(first.root,'current.json'),'utf8'));
    expect(active.indexes).toEqual([a,b]);
    const newer={...b,id:`${next.id}-v3`};
    await transitionBatch(first.root,newer,actor,'activate',async()=>{});
    expect(JSON.parse(readFileSync(join(first.root,'current.json'),'utf8')).indexes).toEqual([a,newer]);
    const previous=JSON.parse(readFileSync(join(first.root,'previous.json'),'utf8'));
    await transitionBatch(first.root,previous,actor,'rollback',async()=>{});
    expect(JSON.parse(readFileSync(join(first.root,'current.json'),'utf8'))).toEqual(active);
  });
  it('registers a new index version of the same raw batch without overwriting the old build', async () => {
    const first = fixture(randomUUID(), 1); const next = fixture(first.id, 2);
    await validateBatchPackage(first.index, first.hash); await validateBatchPackage(next.index, next.hash);
    const path1 = registerBatch(first.root, first.staging, first.hash, randomUUID());
    const path2 = registerBatch(first.root, next.staging, next.hash, randomUUID());
    expect(path2).not.toBe(path1); expect(fileHash(`${path1}.manifest.json`)).toBe(first.hash);
  });
  it('restores the previous pointer and process when activation health fails; supports explicit rollback', async () => {
    const f = fixture(); const previous = {id:'legacy',path:'/legacy/index'}; const target = {id:f.id,path:f.index,manifestHash:f.hash}; atomicControl(join(f.root,'current.json'),previous);
    const oldHistory={id:'older',path:'/older/index'}; atomicControl(join(f.root,'previous.json'),oldHistory);
    const restarts: string[] = [];
    await expect(transitionBatch(f.root,target,randomUUID(),'activate',async selection => { restarts.push(selection.indexes.at(-1)!.path); if (selection.indexes.some(x=>x.path===f.index)) throw Error('health failed'); })).rejects.toThrow('health failed');
    expect(restarts).toEqual([f.index,previous.path]); expect(JSON.parse(readFileSync(join(f.root,'current.json'),'utf8')).indexes).toEqual([previous]);
    expect(JSON.parse(readFileSync(join(f.root,'previous.json'),'utf8'))).toEqual(oldHistory);
    await transitionBatch(f.root,target,randomUUID(),'activate',async () => {});
    await transitionBatch(f.root,{schema:'vibehard-index-set/v1',indexes:[previous]},randomUUID(),'rollback',async () => {});
    expect(JSON.parse(readFileSync(join(f.root,'current.json'),'utf8')).indexes).toEqual([previous]);
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
    atomicControl(join(f.root,'batches',indexBuildId(f.manifest),'evaluation.json'),result);
    expect(selectedBatch(f.root,indexBuildId(f.manifest)).path).toBe(path);
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
