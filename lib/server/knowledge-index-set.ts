import { statSync } from 'node:fs';
import { z } from 'zod';
import { digest } from './knowledge-batch-policy';

const entrySchema = z.object({ id: z.string().min(1).max(100), batchId: z.uuid().optional(), path: z.string().min(1).max(2000), manifestHash: digest.optional() }).strict();
export type IndexEntry = z.infer<typeof entrySchema>;
export type IndexSet = { schema: 'vibehard-index-set/v1'; indexes: IndexEntry[] };
export const MAX_ACTIVE_INDEXES = 4;
export const ACTIVE_INDEX_BUDGET = 256 * 1024 ** 2;
export function rawBatchKey(entry: IndexEntry) {
  return entry.batchId ?? (entry.id === 'legacy-20260926' ? '6cf96eea-af45-4e7d-96c0-c99afbe8c192' : entry.id.replace(/-v[1-9][0-9]*$/, ''));
}
export function indexSet(value: unknown): IndexSet {
  const parsed = z.union([entrySchema, z.object({ schema: z.literal('vibehard-index-set/v1'), indexes: z.array(entrySchema).min(1).max(MAX_ACTIVE_INDEXES) }).strict()]).parse(value);
  const indexes = 'indexes' in parsed ? parsed.indexes : [parsed];
  if (new Set(indexes.map(rawBatchKey)).size !== indexes.length || new Set(indexes.map(x=>x.path)).size !== indexes.length) throw Error('DUPLICATE_ACTIVE_BATCH');
  return { schema: 'vibehard-index-set/v1', indexes };
}
export function activateInSet(current: unknown, target: IndexEntry): IndexSet {
  const previous = indexSet(current); const key = rawBatchKey(target);
  const indexes = previous.indexes.map(entry => rawBatchKey(entry) === key ? target : entry);
  if (!previous.indexes.some(entry=>rawBatchKey(entry) === key)) indexes.push(target);
  return indexSet({ schema: previous.schema, indexes });
}
export function checkIndexSetBudget(value: IndexSet) {
  const bytes = value.indexes.reduce((total, entry) => total + statSync(entry.path).size, 0);
  if (bytes > ACTIVE_INDEX_BUDGET) throw Error('ACTIVE_INDEX_BUDGET_EXCEEDED');
  return bytes;
}
