import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';

export const digest = z.string().regex(/^[a-f0-9]{64}$/);
const location = z.string().min(1).max(1200).refine(p => !p.startsWith('/') && !p.includes('\\') && !p.split(/[!/]/).includes('..') && !/^[a-z]:/i.test(p) && !/[\x00-\x1f]/.test(p));
export const batchManifestSchema = z.object({
  schema: z.literal('vibehard-controlled-index/v2'), batchId: z.uuid(), version: z.number().int().positive(),
  sqliteSha256: digest, indexedChunks: z.number().int().min(1).max(100000),
  createdAt: z.iso.datetime(), reviewMethod: z.literal('automatic_rules_v1'), manualReview: z.literal(false),
  sources: z.array(z.object({ sha256: digest, path: location, aliases: z.array(location).max(128),
    rawObjects: z.array(z.object({ key: z.string().regex(/^knowledge\/raw\/v1\/[a-f0-9-]+\/[a-zA-Z0-9/_.-]+$/).max(1500), sha256: digest })).min(1).max(128),
    status: z.enum(['auto_approved_for_index', 'quarantine']), flags: z.array(z.string().max(100)).max(30),
    boards: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/)).max(128), families: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,49}$/)).max(20),
    category: z.string().max(60),
  })).min(1).max(10000),
  probes: z.array(z.object({ query: z.string().min(3).max(300), expectedSha256: digest })).min(1).max(30),
}).strict();
export type BatchManifest = z.infer<typeof batchManifestSchema>;
export function readBatchManifest(indexPath: string, expectedHash: string): BatchManifest {
  const path = `${indexPath}.manifest.json`;
  if (statSync(path).size > 8 * 1024 * 1024) throw Error('Manifest budget exceeded');
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw Error('Manifest checksum mismatch');
  const value = batchManifestSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (new Set(value.sources.map(s => s.sha256)).size !== value.sources.length) throw Error('Duplicate source policy');
  if (value.sources.some(s => s.status === 'auto_approved_for_index' && s.flags.length)) throw Error('Flagged source cannot be indexed');
  return value;
}
