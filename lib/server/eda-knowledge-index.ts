import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const documentSchema = z.object({
  sourceSha256: sha,
  sourcePath: z.string().min(1).max(1000),
  category: z.string().min(1).max(40),
  review: z.object({ status: z.string().min(1), manualReview: z.boolean() }),
});
const manifestSchema = z.object({
  schema: z.literal('vibehard-oss-processed-batch/v1'),
  review: z.object({ manualReview: z.boolean() }),
  statistics: z.object({ auto_approved_for_index: z.number().int().nonnegative(), indexedChunks: z.number().int().nonnegative(), quarantine: z.number().int().nonnegative() }),
  artifacts: z.object({
    'chunks.jsonl.gz': z.object({ key: z.string().regex(/^knowledge\/processed\/[A-Za-z0-9/._-]+\/chunks\.jsonl\.gz$/), bytes: z.number().int().positive().max(12_000_000), sha256: sha }),
  }),
  documents: z.array(documentSchema).max(10_000),
});
const chunkSchema = z.object({
  id: z.string().min(1).max(120),
  sourceSha256: sha,
  sourcePath: z.string().min(1).max(1000),
  category: z.string().min(1).max(40),
  page: z.number().int().positive(),
  text: z.string().min(1).max(10_000),
});

export type EdaKnowledgeHit = {
  sourceSha256: string;
  source: string;
  category: string;
  page: number;
  excerpt: string;
  reviewStatus: 'auto_approved_for_index';
  manualReview: boolean;
};
export type EdaKnowledgeSearch = { snapshotSha256: string; indexedSources: number; quarantinedSources: number; hits: EdaKnowledgeHit[] };
type IndexedChunk = { sourceSha256: string; source: string; category: string; page: number; text: string; normalized: string; manualReview: boolean };
export type EdaKnowledgeIndex = { snapshotSha256: string; indexedSources: number; quarantinedSources: number; chunks: IndexedChunk[]; artifactKey: string };

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

/** Parse a pinned, hashed OSS snapshot. Index permission is not hardware approval. */
export function buildKnowledgeIndex(manifestBytes: Uint8Array, compressedBytes: Uint8Array): EdaKnowledgeIndex {
  if (manifestBytes.byteLength > 1_000_000) throw new Error('Knowledge manifest exceeds size limit');
  const manifest = manifestSchema.parse(JSON.parse(decode(manifestBytes)));
  const artifact = manifest.artifacts['chunks.jsonl.gz'];
  if (compressedBytes.byteLength !== artifact.bytes) throw new Error('Knowledge chunks size mismatch');
  if (digest(compressedBytes) !== artifact.sha256) throw new Error('Knowledge chunks hash mismatch');
  const approved = new Map(manifest.documents.filter(doc => doc.review.status === 'auto_approved_for_index').map(doc => [doc.sourceSha256, doc]));
  if (approved.size !== manifest.statistics.auto_approved_for_index) throw new Error('Knowledge approved-source count mismatch');
  const raw = gunzipSync(compressedBytes, { maxOutputLength: 64_000_000 });
  const lines = decode(raw).trimEnd().split('\n');
  if (lines.length > 30_000) throw new Error('Knowledge chunk count exceeds limit');
  const chunks: IndexedChunk[] = [];
  for (const line of lines) {
    if (!line) continue;
    const chunk = chunkSchema.parse(JSON.parse(line));
    const source = approved.get(chunk.sourceSha256);
    if (!source) continue;
    if (source.sourcePath !== chunk.sourcePath) throw new Error('Knowledge source path mismatch');
    if (source.category !== chunk.category) throw new Error('Knowledge source category mismatch');
    chunks.push({ sourceSha256: chunk.sourceSha256, source: chunk.sourcePath.split('/').at(-1) || chunk.sourcePath, category: chunk.category, page: chunk.page, text: chunk.text, normalized: chunk.text.normalize('NFKC').toLowerCase(), manualReview: source.review.manualReview });
  }
  if (chunks.length !== manifest.statistics.indexedChunks) throw new Error('Knowledge indexed-chunk count mismatch');
  return { snapshotSha256: digest(manifestBytes), indexedSources: approved.size, quarantinedSources: manifest.statistics.quarantine, chunks, artifactKey: artifact.key };
}

export function readKnowledgeArtifact(manifestBytes: Uint8Array): { key: string; bytes: number; sha256: string } {
  if (manifestBytes.byteLength > 1_000_000) throw new Error('Knowledge manifest exceeds size limit');
  const manifest = manifestSchema.parse(JSON.parse(decode(manifestBytes)));
  return manifest.artifacts['chunks.jsonl.gz'];
}

function queryTerms(query: string): string[] {
  const normalized = query.normalize('NFKC').toLowerCase();
  const ascii = normalized.match(/[a-z][a-z0-9]*(?:[-_/][a-z0-9]+)*/g) || [];
  const han = normalized.match(/[\p{Script=Han}]{2,}/gu) || [];
  const terms = [...ascii, ...han.flatMap(value => value.length <= 8 ? [value] : Array.from({ length: Math.min(value.length - 2, 6) }, (_, i) => value.slice(i, i + 3)))];
  return [...new Set(terms.filter(term => term.length >= 2 && term.length <= 40))].slice(0, 10);
}

export function searchKnowledgeIndex(index: EdaKnowledgeIndex, query: string, limit = 5): EdaKnowledgeSearch {
  const terms = queryTerms(query.slice(0, 240));
  if (!terms.length) return { snapshotSha256: index.snapshotSha256, indexedSources: index.indexedSources, quarantinedSources: index.quarantinedSources, hits: [] };
  const schematicIntent = /原理图|schematic/i.test(query);
  const frequency = terms.map(term => index.chunks.reduce((count, chunk) => count + Number(chunk.normalized.includes(term)), 0));
  // A named part/board is the user's strongest constraint. Do not return a generic
  // schematic or manual merely because the requested device is absent.
  const deviceTerms = terms.filter(term => term.length >= 4 && /\d/.test(term));
  if (deviceTerms.some(term => frequency[terms.indexOf(term)] === 0)) return { snapshotSha256: index.snapshotSha256, indexedSources: index.indexedSources, quarantinedSources: index.quarantinedSources, hits: [] };
  const ranked = new Map<string, { chunk: IndexedChunk; score: number; firstMatch: number }>();
  for (const chunk of index.chunks) {
    if (schematicIntent && chunk.category !== 'schematics' && chunk.category !== 'boards') continue;
    if (deviceTerms.some(term => !chunk.normalized.includes(term))) continue;
    let score = 0; let firstMatch = -1;
    for (const [i, term] of terms.entries()) {
      const position = chunk.normalized.indexOf(term);
      if (position < 0) continue;
      if (firstMatch < 0 || position < firstMatch) firstMatch = position;
      score += 1 + Math.log((index.chunks.length + 1) / (frequency[i] + 1));
    }
    if (!score) continue;
    score *= chunk.category === 'schematics' ? 1.25 : chunk.category === 'boards' ? 1.1 : 1;
    const previous = ranked.get(chunk.sourceSha256);
    if (!previous || score > previous.score) ranked.set(chunk.sourceSha256, { chunk, score, firstMatch });
  }
  const hits = [...ranked.values()].sort((a, b) => b.score - a.score || a.chunk.source.localeCompare(b.chunk.source)).slice(0, Math.max(1, Math.min(10, limit))).map(({ chunk, firstMatch }): EdaKnowledgeHit => {
    const start = Math.max(0, firstMatch - 120);
    return { sourceSha256: chunk.sourceSha256, source: chunk.source, category: chunk.category, page: chunk.page, excerpt: chunk.text.slice(start, start + 600).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' '), reviewStatus: 'auto_approved_for_index', manualReview: chunk.manualReview };
  });
  return { snapshotSha256: index.snapshotSha256, indexedSources: index.indexedSources, quarantinedSources: index.quarantinedSources, hits };
}
