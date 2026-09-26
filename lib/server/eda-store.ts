import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseDocument } from '@/lib/eda/document';
import type { EdaDocument } from '@/lib/eda/types';

export class EdaConflictError extends Error { constructor() { super('保存冲突：项目已被更新，请重新加载后合并修改'); } }
export type StoredEdaProject = { document: EdaDocument; version: number; savedAt: string };
const rootPath = () => process.env.EDA_DATA_ROOT || join(process.cwd(), '.eda-data');
function location(userId: string, projectId: string, root: string) {
  z.uuid().parse(userId); z.uuid().parse(projectId);
  return join(resolve(root), userId, projectId);
}
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

// The caller must authorize project ownership. UUID-only path segments provide a second boundary.
export async function loadEdaProject(userId: string, projectId: string, root = rootPath()): Promise<StoredEdaProject | null> {
  const directory = location(userId, projectId, root);
  let content: string;
  try { content = await readFile(join(directory, 'current.json'), 'utf8'); }
  catch (error) { if (missing(error)) return null; throw error; }
  const saved = z.object({ document: z.unknown(), version: z.number().int().positive(), savedAt: z.string().datetime() }).parse(JSON.parse(content));
  return { ...saved, document: parseDocument(saved.document) };
}

export async function saveEdaProject(userId: string, projectId: string, input: unknown, expectedVersion: number | null, root = rootPath()): Promise<StoredEdaProject> {
  const document = parseDocument(input);
  z.number().int().positive().nullable().parse(expectedVersion);
  const directory = location(userId, projectId, root);
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.write-lock');
  try { await mkdir(lock); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new EdaConflictError(); throw error; }
  const temporary = join(directory, `${randomUUID()}.tmp`);
  try {
    const current = await loadEdaProject(userId, projectId, root);
    if ((current?.version ?? null) !== expectedVersion) throw new EdaConflictError();
    const saved = { document, version: (current?.version ?? 0) + 1, savedAt: new Date().toISOString() };
    const encoded = JSON.stringify(saved);
    const versions = join(directory, 'versions');
    await mkdir(versions, { recursive: true });
    // An immutable snapshot is written before atomically replacing the current pointer/document.
    await writeFile(join(versions, `${saved.version}-${randomUUID()}.json`), encoded, { flag: 'wx', mode: 0o600 });
    await writeFile(temporary, encoded, { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(directory, 'current.json'));
    return saved;
  } finally {
    await rm(temporary, { force: true });
    await rmdir(lock);
  }
}
