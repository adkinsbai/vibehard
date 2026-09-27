import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeIndex, searchKnowledgeIndex } from '@/lib/server/eda-knowledge-index';

const approvedSha = 'a'.repeat(64);
const quarantinedSha = 'b'.repeat(64);

function fixture() {
  const chunks = [
    { id: 'one', sourceSha256: approvedSha, sourcePath: 'ESP32-S3/board/schematic.pdf', category: 'schematics', page: 4, part: 0, start: 0, end: 58, method: 'text', text: 'ESP32-S3 reset circuit uses EN and a pull-up resistor.' },
    { id: 'two', sourceSha256: quarantinedSha, sourcePath: 'ESP32-S3/board/unreviewed.pdf', category: 'boards', page: 1, part: 0, start: 0, end: 32, method: 'text', text: 'SIM7670X private draft circuit.' },
  ];
  const compressed = gzipSync(chunks.map(item => JSON.stringify(item)).join('\n') + '\n');
  const manifest = {
    schema: 'vibehard-oss-processed-batch/v1',
    review: { method: 'automatic_rules_v1', manualReview: false, meaning: 'index candidate only' },
    statistics: { uniqueSources: 2, sourceAliases: 2, auto_approved_for_index: 1, indexedPages: 1, indexedChunks: 1, quarantine: 1 },
    artifacts: { 'chunks.jsonl.gz': { key: 'knowledge/processed/v1/test/chunks.jsonl.gz', bytes: compressed.length, sha256: createHash('sha256').update(compressed).digest('hex') } },
    documents: [
      { sourceSha256: approvedSha, sourcePath: chunks[0].sourcePath, category: 'schematics', review: { status: 'auto_approved_for_index', manualReview: false } },
      { sourceSha256: quarantinedSha, sourcePath: chunks[1].sourcePath, category: 'boards', review: { status: 'quarantine', manualReview: false } },
    ],
  };
  return { manifest: Buffer.from(JSON.stringify(manifest)), compressed };
}

describe('read-only EDA knowledge index', () => {
  it('returns cited reference text without admitting quarantined sources', () => {
    const { manifest, compressed } = fixture();
    const index = buildKnowledgeIndex(manifest, compressed);
    expect(index.indexedSources).toBe(1);
    expect(index.quarantinedSources).toBe(1);
    expect(searchKnowledgeIndex(index, 'ESP32-S3 reset circuit')).toMatchObject({
      hits: [{ source: 'schematic.pdf', category: 'schematics', page: 4, reviewStatus: 'auto_approved_for_index' }],
    });
    expect(searchKnowledgeIndex(index, 'SIM7670X').hits).toEqual([]);
  });

  it('rejects a changed compressed object before parsing its content', () => {
    const { manifest, compressed } = fixture();
    expect(() => buildKnowledgeIndex(manifest, Buffer.concat([compressed, Buffer.from('tampered')]))).toThrow(/hash|size/i);
  });

  it('rejects an indexed chunk that changes the manifest source path', () => {
    const { manifest, compressed } = fixture();
    const changed = gzipSync(JSON.stringify({ id: 'one', sourceSha256: approvedSha, sourcePath: 'other.pdf', category: 'schematics', page: 1, text: 'ESP32-S3' }) + '\n');
    const parsed = JSON.parse(manifest.toString('utf8'));
    parsed.artifacts['chunks.jsonl.gz'] = { ...parsed.artifacts['chunks.jsonl.gz'], bytes: changed.length, sha256: createHash('sha256').update(changed).digest('hex') };
    expect(() => buildKnowledgeIndex(Buffer.from(JSON.stringify(parsed)), changed)).toThrow(/source path/i);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('bounds excerpts and result count', () => {
    const { manifest, compressed } = fixture();
    const index = buildKnowledgeIndex(manifest, compressed);
    const result = searchKnowledgeIndex(index, 'ESP32-S3', 20);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].excerpt.length).toBeLessThanOrEqual(600);
    expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('does not return a generic schematic when a requested device is absent', () => {
    const { manifest, compressed } = fixture();
    const parsed = JSON.parse(manifest.toString('utf8'));
    const firmwareSha = 'c'.repeat(64);
    parsed.documents.push({ sourceSha256: firmwareSha, sourcePath: 'ESP32-S3/README.md', category: 'firmware', review: { status: 'auto_approved_for_index', manualReview: false } });
    parsed.statistics.auto_approved_for_index = 2;
    parsed.statistics.indexedChunks = 2;
    const firmwareChunk = { id: 'firmware', sourceSha256: firmwareSha, sourcePath: 'ESP32-S3/README.md', category: 'firmware', page: 1, text: 'STM32F4 schematic example mentioned in a firmware README.' };
    const nextCompressed = gzipSync(gunzipSync(compressed).toString('utf8') + JSON.stringify(firmwareChunk) + '\n');
    parsed.artifacts['chunks.jsonl.gz'] = { ...parsed.artifacts['chunks.jsonl.gz'], bytes: nextCompressed.length, sha256: createHash('sha256').update(nextCompressed).digest('hex') };
    const index = buildKnowledgeIndex(Buffer.from(JSON.stringify(parsed)), nextCompressed);
    expect(searchKnowledgeIndex(index, 'STM32F4').hits).toHaveLength(1);
    expect(searchKnowledgeIndex(index, 'STM32F4 schematic').hits).toEqual([]);
  });
});
