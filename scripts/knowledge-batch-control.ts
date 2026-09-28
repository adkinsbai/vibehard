// SSH/operator CLI only: no browser upload or public retrieval endpoints.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { requireDb, closeDb } from '@/lib/db';
import { atomicControl, buildIdSchema, evaluateBatch, fileHash, indexBuildId, lockControl, regularFile, registerBatch, requireBatchAdministrator, selectedBatch, transitionBatch, validateBatchPackage } from '@/lib/server/knowledge-batch-control';
import { digest } from '@/lib/server/knowledge-batch-policy';
import { queryPrivateIndex } from '@/lib/server/retrieval-client';
import { indexSetPolicy } from '@/lib/server/retrieval-daemon';
import { activateInSet, checkIndexSetBudget, indexSet, type IndexSet } from '@/lib/server/knowledge-index-set';

const root = '/opt/vibehard/knowledge/control'; const socket = '/run/vibehard-knowledge/search.sock';
async function main() {
  assert.equal(process.getuid?.(), 0, 'OPERATOR_REQUIRED');
  const [command, actorId, argument, hash] = process.argv.slice(2); z.uuid().parse(actorId);
  const [actor] = await requireDb().select({ id: users.id, role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
  requireBatchAdministrator(actor);
  assert.ok(['register','evaluate','activate','rollback','disable','enable','status'].includes(command));
  mkdirSync(root, { mode: 0o750, recursive: true });
  const info = statSync(root); assert.equal(info.uid, 0); assert.equal(info.mode & 0o022, 0, 'ROOT_DIRECTORY_WRITABLE');
  const unlock = lockControl(root);
  try {
    const currentPath = join(root, 'current.json'); const disabledPath = join(root, 'disabled.json');
    if (command === 'register') {
      const staging = resolve(argument); assert.ok(staging.startsWith('/opt/vibehard/knowledge/staging/'));
      regularFile(join(staging, 'knowledge-fts.sqlite'), '/opt/vibehard/knowledge/staging', 256 * 1024 ** 2);
      const manifest = await validateBatchPackage(join(staging, 'knowledge-fts.sqlite'), hash);
      const path = registerBatch(root, staging, hash, actorId);
      // Inherit the root-owned knowledge group; no reader gets write permission.
      const group = spawnSync('chgrp', ['-R', 'vibehard-knowledge', resolve(path, '..')]); assert.equal(group.status, 0);
      console.log(JSON.stringify({ registered: true, buildId: indexBuildId(manifest), path, activated: false }));
    } else if (command === 'evaluate') {
      buildIdSchema.parse(argument); const directory = join(root, 'batches', argument);
      const registration = JSON.parse(readFileSync(join(directory, 'registration.json'), 'utf8'));
      const result = await evaluateBatch(join(directory, 'knowledge-fts.sqlite'), registration.manifestHash);
      atomicControl(join(directory, 'evaluation.json'), { ...result, actorId }); console.log(JSON.stringify(result));
    } else if (command === 'activate' || command === 'rollback') {
      // A rollback is an explicit selection of another already evaluated version.
      assert.ok(existsSync(currentPath), 'Initialize current legacy pointer during deployment first');
      const target = command === 'rollback' && argument === 'previous' ? indexSet(JSON.parse(readFileSync(join(root, 'previous.json'), 'utf8'))) : selectedBatch(root, argument);
      const selection = 'indexes' in target ? target : activateInSet(JSON.parse(readFileSync(currentPath,'utf8')), target);
      checkIndexSetBudget(selection);
      for(const entry of selection.indexes) {
        if (entry.id === 'legacy-20260926') {
          assert.equal(entry.path, '/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite');
          assert.equal(fileHash(entry.path), 'cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9');
        } else {
          const registered=selectedBatch(root,entry.id);
          assert.equal(registered.path,entry.path); assert.equal(registered.manifestHash,entry.manifestHash);
          await validateBatchPackage(entry.path,entry.manifestHash!);
        }
      }
      console.log(JSON.stringify(await transitionBatch(root, selection, actorId, command, restartAndVerify)));
    } else if (command === 'disable' || command === 'enable') {
      digest.parse(argument); const old = z.array(digest).max(10000).parse(JSON.parse(readFileSync(disabledPath, 'utf8')));
      const next = command === 'disable' ? [...new Set([...old, argument])] : old.filter(sha => sha !== argument);
      z.array(digest).max(10000).parse(next);
      atomicControl(join(root, `sources-${Date.now()}.json`), { actorId, command, sha256: argument, previousSha256: fileHash(disabledPath), at: new Date().toISOString() });
      atomicControl(disabledPath, next); console.log(JSON.stringify({ command, sourceSha256: argument }));
    } else console.log(readFileSync(currentPath, 'utf8'));
  } finally { unlock(); }
}
async function restartAndVerify(selection: IndexSet) {
  process.env.VIBEHARD_RETRIEVAL_SOCKET = socket;
  process.env.VIBEHARD_DISABLED_SOURCES_FILE = join(root, 'disabled.json');
  assert.equal(spawnSync('systemctl', ['restart','vibehard-knowledge-retrieval.service'], { timeout: 20000 }).status, 0, 'RESTART_FAILED');
  for (let n = 0; n < 20; n++) {
    try { const result = await queryPrivateIndex('indexwarmup'); if (result.revision === indexSetPolicy(selection.indexes.map(x=>x.path)).revision) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('ACTIVATION_HEALTH_FAILED');
}
void main().catch(error => { console.error(JSON.stringify({ failed: true, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'CONTROL_FAILED' })); process.exitCode = 1; }).finally(closeDb);
