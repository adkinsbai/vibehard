// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStarterDocument } from '@/lib/eda/document';
import { loadEdaProject, saveEdaProject } from '@/lib/server/eda-store';

let root: string;
const user = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'vibehard-eda-test-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
describe('persistent EDA versions', () => {
  it('restores an exact document and preserves prior versions', async () => {
    const document = createStarterDocument();
    expect(await loadEdaProject(user, project, root)).toBeNull();
    expect((await saveEdaProject(user, project, document, null, root)).version).toBe(1);
    const revised = { ...document, name: 'Edited', revision: 2 };
    expect((await saveEdaProject(user, project, revised, 1, root)).version).toBe(2);
    expect((await loadEdaProject(user, project, root))?.document).toEqual(revised);
    expect(await readdir(join(root, user, project, 'versions'))).toHaveLength(2);
  });
  it('rejects stale writes and isolates user directories', async () => {
    await saveEdaProject(user, project, createStarterDocument(), null, root);
    await expect(saveEdaProject(user, project, createStarterDocument(), null, root)).rejects.toThrow(/冲突/);
    expect(await loadEdaProject('33333333-3333-4333-8333-333333333333', project, root)).toBeNull();
    await expect(loadEdaProject('../escape', project, root)).rejects.toThrow();
  });
  it('allows only one concurrent write at the expected version', async () => {
    const doc = createStarterDocument();
    await saveEdaProject(user, project, doc, null, root);
    const writes = await Promise.allSettled(Array.from({ length: 3 }, () => saveEdaProject(user, project, doc, 1, root)));
    expect(writes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect((await loadEdaProject(user, project, root))?.version).toBe(2);
  });
  it('validates input before writing', async () => {
    await expect(saveEdaProject(user, project, { ...createStarterDocument(), board: { width: Infinity, height: 55 } }, null, root)).rejects.toThrow();
    expect(await loadEdaProject(user, project, root)).toBeNull();
  });
});
