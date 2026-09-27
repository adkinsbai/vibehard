import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { digest, readBatchManifest } from './knowledge-batch-policy';
import { closeIndexedKnowledge, searchIndexedKnowledge } from './oss-knowledge-index';

export const INDEX_BUDGET = 256 * 1024 ** 2;
export const RETENTION_BUDGET = 768 * 1024 ** 2;
export function requireBatchAdministrator(actor: { id: string; role: string } | undefined) {
  if (!actor || actor.role !== 'admin' || !z.uuid().safeParse(actor.id).success) throw Error('ADMIN_REQUIRED');
}
export function fileHash(path: string) { const hash = createHash('sha256'); const fd = openSync(path, 'r'); const block = Buffer.alloc(1024 * 1024); try { let count; while ((count = readSync(fd, block, 0, block.length, null))) hash.update(block.subarray(0, count)); return hash.digest('hex'); } finally { closeSync(fd); } }
export function atomicControl(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o640 }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function lockControl(root: string) {
  const path = join(root, '.operation.lock'); const fd = openSync(path, 'wx', 0o600);
  return () => { closeSync(fd); unlinkSync(path); };
}
export function regularFile(path: string, root: string, maxBytes: number) {
  const absolute = resolve(path); const boundary = resolve(root);
  if (!absolute.startsWith(boundary + sep)) throw Error('PATH_OUTSIDE_STAGING');
  let cursor = absolute;
  while (cursor !== boundary) { if (lstatSync(cursor).isSymbolicLink()) throw Error('SYMLINK_REJECTED'); cursor = resolve(cursor, '..'); }
  const file = lstatSync(path);
  if (!file.isFile() || file.nlink !== 1 || file.size > maxBytes || file.size < 1) throw Error('FILE_BUDGET_OR_TYPE');
}
export async function validateBatchPackage(index: string, expectedManifest: string) {
  digest.parse(expectedManifest);
  const parent = resolve(index, '..');
  regularFile(index, parent, INDEX_BUDGET);
  regularFile(`${index}.meta.json`, parent, 4096);
  regularFile(`${index}.manifest.json`, parent, 8 * 1024 ** 2);
  const manifest = readBatchManifest(index, expectedManifest);
  const meta = z.object({ schema: z.literal('vibehard-controlled-index/v2'), batchId: z.uuid(), manifestSha256: digest, sqliteSha256: digest, indexedChunks: z.number() }).strict().parse(JSON.parse(readFileSync(`${index}.meta.json`, 'utf8')));
  if (meta.manifestSha256 !== expectedManifest || meta.sqliteSha256 !== manifest.sqliteSha256 || meta.batchId !== manifest.batchId || meta.indexedChunks !== manifest.indexedChunks || fileHash(index) !== manifest.sqliteSha256) throw Error('PACKAGE_HASH_MISMATCH');
  const bySource = new Map(manifest.sources.map(s => [s.sha256, s]));
  const db = new DatabaseSync(index, { readOnly: true }); let count = 0;
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON; PRAGMA cache_size=-8192; PRAGMA mmap_size=0');
    if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw Error('INDEX_CORRUPT');
    for (const row of db.prepare('SELECT id,source_sha,source_path,page,part,text FROM chunks').iterate()) {
      const source = bySource.get(String(row.source_sha));
      if (!source || source.status !== 'auto_approved_for_index' || !source.aliases.includes(String(row.source_path)) || !digest.safeParse(row.id).success || Number(row.page) < 1 || Number(row.part) < 1 || typeof row.text !== 'string' || !row.text.length || row.text.length > 1800) throw Error('CHUNK_POLICY_MISMATCH');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|LTAI[0-9A-Za-z]{16,})\b|ignore (?:all |any |the )?(?:previous|system) instructions/i.test(row.text)) throw Error('QUARANTINE_REQUIRED');
      if (++count > 100000) throw Error('CHUNK_BUDGET');
    }
    if (count !== manifest.indexedChunks) throw Error('CHUNK_COUNT_MISMATCH');
  } finally { db.close(); }
  return manifest;
}
export function registerBatch(root: string, staging: string, manifestHash: string, actorId: string) {
  const index = join(staging, 'knowledge-fts.sqlite'); const manifest = readBatchManifest(index, manifestHash);
  const batches = join(root, 'batches'); mkdirSync(batches, { recursive: true, mode: 0o750 });
  const entries = readdirSync(batches, { withFileTypes: true }).filter(e => e.isDirectory());
  const used = entries.reduce((n,e) => n + statSync(join(batches, e.name, 'knowledge-fts.sqlite')).size, 0);
  if (entries.length >= 3 || used + statSync(index).size > RETENTION_BUDGET) throw Error('RETENTION_BUDGET_EXCEEDED_ARCHIVE_EXPLICITLY');
  const target = join(batches, manifest.batchId); mkdirSync(target, { mode: 0o750 });
  try {
    for (const suffix of ['', '.meta.json', '.manifest.json']) { copyFileSync(index + suffix, join(target, `knowledge-fts.sqlite${suffix}`), 1); chmodSync(join(target, `knowledge-fts.sqlite${suffix}`), 0o640); }
    atomicControl(join(target, 'registration.json'), { actorId, manifestHash, at: new Date().toISOString(), status: 'registered' });
  } catch (error) { atomicControl(join(target, 'registration-error.json'), { status: 'failed', code: 'COPY_FAILED' }); throw error; }
  return join(target, 'knowledge-fts.sqlite');
}
export async function evaluateBatch(index: string, manifestHash: string) {
  const manifest = await validateBatchPackage(index, manifestHash); const samples: number[] = [];
  try {
    await searchIndexedKnowledge('warmup', index);
    for (let n = 0; n < 60; n += 2) await Promise.all([n, n + 1].map(async ordinal => {
      const probe = manifest.probes[ordinal % manifest.probes.length]; const start = performance.now();
      const refs = await searchIndexedKnowledge(probe.query, index); samples.push(performance.now() - start);
      if (!refs.some(ref => ref.version.sha256 === probe.expectedSha256)) throw Error('RETRIEVAL_PROBE_FAILED');
      if (refs.some(ref => ref.reviewStatus !== 'auto-indexed' || !manifest.sources.some(s => s.sha256 === ref.version.sha256 && s.status === 'auto_approved_for_index'))) throw Error('REFERENCE_POLICY_FAILED');
    }));
    if ((await searchIndexedKnowledge('ESP32-S3-Unknown-Variant-999 原理图', index)).length) throw Error('WRONG_VARIANT');
    samples.sort((a,b) => a-b); const p95Ms = samples[Math.ceil(samples.length * .95)-1]; const rss = process.memoryUsage().rss;
    if (p95Ms >= 500 || rss > 384 * 1024 ** 2) throw Error('LOAD_GATE_FAILED');
    return { passed: true, manifestHash, sqliteSha256: manifest.sqliteSha256, p95Ms, rssBytes: rss, requests: 60, at: new Date().toISOString() };
  } finally { closeIndexedKnowledge(); }
}
export function selectedBatch(root: string, id: string) {
  z.uuid().parse(id); const directory = join(root, 'batches', id); const index = join(directory, 'knowledge-fts.sqlite');
  const registration = JSON.parse(readFileSync(join(directory, 'registration.json'), 'utf8'));
  const evaluation = JSON.parse(readFileSync(join(directory, 'evaluation.json'), 'utf8'));
  if (!evaluation.passed || evaluation.manifestHash !== registration.manifestHash || evaluation.sqliteSha256 !== fileHash(index) || evaluation.p95Ms >= 500 || evaluation.rssBytes > 384 * 1024 ** 2 || evaluation.requests !== 60) throw Error('EVALUATION_REQUIRED');
  const manifest = readBatchManifest(index, registration.manifestHash);
  return { id: manifest.batchId, path: index, manifestHash: registration.manifestHash };
}
export async function transitionBatch(root: string, target: { id: string; path: string; manifestHash?: string }, actorId: string, command: string, restart: (path: string) => Promise<void>) {
  const currentPath = join(root, 'current.json'); const previous = JSON.parse(readFileSync(currentPath, 'utf8'));
  atomicControl(join(root, 'previous.json'), previous);
  atomicControl(join(root, `transition-${Date.now()}-${randomUUID()}.json`), { command, actorId, previous, target, at: new Date().toISOString() });
  atomicControl(currentPath, target);
  try { await restart(target.path); }
  catch (error) { atomicControl(currentPath, previous); await restart(previous.path); throw error; }
  return { command, active: target.id, previous: previous.id };
}
