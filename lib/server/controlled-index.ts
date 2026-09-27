import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RetrievalSource } from '@/lib/agent/knowledge-retrieval';
import type { BatchManifest } from './knowledge-batch-policy';

const namesIn = (query: string, names: string[]) => names.filter(name => new RegExp(`(^|[^A-Za-z0-9._-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._-])`, 'i').test(query));
export function searchControlledIndex(db: DatabaseSync, manifest: BatchManifest, query: string, terms: string[]): RetrievalSource[] {
  const allBoards = [...new Set(manifest.sources.flatMap(s => s.boards))];
  const boards = namesIn(query, allBoards);
  const explicit = query.match(/\bESP32-S3-[A-Za-z0-9][A-Za-z0-9._-]*/gi) ?? [];
  if (explicit.some(b => !allBoards.some(n => n.toLowerCase() === b.toLowerCase()))) return [];
  const families = [...new Set([...namesIn(query, [...new Set(manifest.sources.flatMap(s => s.families))]), ...(query.match(/\b(?:RV1106|RV1126B|ESP32-S3|RP2040|STM32[A-Z0-9]+|NRF52\d+)\b/gi) ?? [])])];
  const schematic = /原理图|电路图|schematic/i.test(query);
  const approved = manifest.sources.filter(s => s.status === 'auto_approved_for_index' &&
    (!boards.length || boards.some(b => s.boards.includes(b))) && (!families.length || families.some(f => s.families.some(known => known.toLowerCase() === f.toLowerCase()))) &&
    (!schematic || s.category === 'schematics' || s.aliases.some(a => a.includes('/1. 硬件资料/') && (!boards.length || boards.some(b => a.includes(`/${b}/`))))));
  if (!approved.length) return [];
  const sourceMap = new Map(approved.map(s => [s.sha256, s]));
  // JSON table parameters avoid unbounded SQL placeholders; policy caps sources.
  const shas = JSON.stringify(approved.map(s => s.sha256));
  type Row = { id: string; source_sha: string; source_path: string; page: number; part: number; text: string };
  const rows = db.prepare(`SELECT chunks.* FROM chunks_fts JOIN chunks ON chunks_fts.rowid=chunks.rowid
    WHERE chunks_fts MATCH ? AND source_sha IN (SELECT value FROM json_each(?))
    ORDER BY bm25(chunks_fts) LIMIT 48`).all(terms.map(t => `text:${JSON.stringify(t)}`).join(' OR '), shas) as Row[];
  if (boards.length === 1 && rows.length < 12) rows.push(...db.prepare(`WITH ranked AS (SELECT *, row_number() OVER (PARTITION BY source_sha ORDER BY page,part) AS n FROM chunks WHERE source_sha IN (SELECT value FROM json_each(?))) SELECT * FROM ranked WHERE n<=2 LIMIT 48`).all(shas) as Row[]);
  const counts = new Map<string, number>(); const seen = new Set<string>(); const result: RetrievalSource[] = [];
  for (const row of rows) {
    const source = sourceMap.get(row.source_sha);
    if (!source || seen.has(row.id) || (counts.get(row.source_sha) ?? 0) >= 2 || !Number.isInteger(row.page) || row.page < 1 || !Number.isInteger(row.part) || row.part < 1 || !row.text || row.text.length > 1800) continue;
    const path = boards.length === 1 ? source.aliases.find(a => a.includes(`/${boards[0]}/`)) ?? source.path : source.path;
    const hex = createHash('sha256').update(`${manifest.batchId}:${row.id}`).digest('hex');
    seen.add(row.id); counts.set(row.source_sha, (counts.get(row.source_sha) ?? 0) + 1);
    result.push({ scope: 'platform', id: `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`, reviewStatus: 'auto-indexed',
      version: { title: path.split('/').at(-1)!, source: `${path}#page=${row.page}&part=${row.part}`, kind: 'manual', content: row.text,
        version: manifest.version, sha256: row.source_sha, reviewedBy: manifest.reviewMethod, reviewedAt: manifest.createdAt } });
    if (result.length >= 12) break;
  }
  return result;
}
