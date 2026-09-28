import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { RetrievalSource } from "@/lib/agent/knowledge-retrieval";
import boardAssociations from "@/lib/server/data/oss-rag-board-associations.json";
import { readBatchManifest, type BatchManifest } from './knowledge-batch-policy';
import { searchControlledIndex } from './controlled-index';
import { MAX_ACTIVE_INDEXES } from './knowledge-index-set';

// This is an internal, read-only service used by the single-concurrency design
// worker after project ownership has been checked. No browser route or OSS key
// is exposed. Production grants file read only to the worker's Unix group.
const MAX_QUERY_TERMS = 12;
const MAX_CANDIDATES = 24;
const MAX_BOARD_ASSOCIATIONS = 128;
const MAX_SOURCES = 12;
const MAX_PER_FILE = 2;
const MAX_INDEX_BYTES = 256 * 1024 * 1024;
const INDEX_BATCH = "6cf96eea-af45-4e7d-96c0-c99afbe8c192";
const APPROVED_MANIFEST_SHA = "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1";

type IndexRow = { id: string; source_sha: string; source_path: string; category: string; page: number; part: number; text: string };
type IndexMetadata = { schema?: string; batchId: string; manifestSha256: string; sqliteSha256: string; indexedChunks: number };
type BoardAssociation = { sourceSha256: string; citationPath: string; category: string };
type BoardAssociations = { indexSha256: string; manifestSha256: string; boards: Record<string, BoardAssociation[]> };
type OpenIndex = { database: DatabaseSync; indexSha256: string; manifest?: BatchManifest };
const cached = new Map<string, OpenIndex>();
const opening = new Map<string, Promise<OpenIndex>>();
const boardNames = Object.keys(boardAssociations.boards).sort((a, b) => b.length - a.length);
const approvedAssociatedShas = new Set(Object.values(boardAssociations.boards).flat().map(entry => entry.sourceSha256));

function boardNamePattern(name: string) {
  return new RegExp(`(^|[^A-Za-z0-9.\\-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9.\\-])`, "i");
}

function requestedBoard(requirement: string) {
  const matches = boardNames.filter(name => boardNamePattern(name).test(requirement));
  // A comparison request names more than one board; it needs the general path.
  return matches.length === 1 ? matches[0] : undefined;
}

function preferredCategory(requirement: string) {
  if (/原理图|电路图|schematic/i.test(requirement)) return "schematics";
  if (/固件|示例|程序|代码|驱动|firmware|\bsdk\b/i.test(requirement)) return "firmware";
  if (/手册|规格|参数|datasheet|manual/i.test(requirement)) return "manuals";
  return "";
}

function terms(requirement: string) {
  const lowered = requirement.toLocaleLowerCase();
  const words = lowered.match(/[a-z0-9][a-z0-9._+-]{2,}/g) ?? [];
  const han = (lowered.match(/[\p{Script=Han}]{3,}/gu) ?? []).flatMap(run => {
    const chars = [...run];
    return chars.slice(0, -2).map((_, i) => chars.slice(i, i + 3).join(""));
  });
  const unique = [...new Set([...words, ...han])];
  // The common chip-family token otherwise dominates the small candidate
  // window and displaces the requested peripheral or document type.
  return (unique.length > 1 ? unique.filter(term => term !== "esp32-s3") : unique).slice(0, MAX_QUERY_TERMS);
}

function referenceId(chunkId: string) {
  const hex = createHash("sha256").update(`${INDEX_BATCH}:${chunkId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function openIndex(path: string) {
  if (cached.has(path)) return cached.get(path)!;
  if (cached.size + opening.size >= MAX_ACTIVE_INDEXES) throw new Error('Active index handle budget exceeded');
  const meta = JSON.parse(readFileSync(`${path}.meta.json`, "utf8")) as IndexMetadata;
  const manifest = meta.schema === 'vibehard-controlled-index/v2' ? readBatchManifest(path, meta.manifestSha256) : undefined;
  if ((manifest ? manifest.batchId !== meta.batchId || manifest.sqliteSha256 !== meta.sqliteSha256 || manifest.indexedChunks !== meta.indexedChunks : meta.batchId !== INDEX_BATCH || meta.manifestSha256 !== APPROVED_MANIFEST_SHA) ||
      !/^[a-f0-9]{64}$/.test(meta.sqliteSha256) || !Number.isInteger(meta.indexedChunks) ||
      meta.indexedChunks < 1 || meta.indexedChunks > 100000) {
    throw new Error("Knowledge index metadata is not an approved batch");
  }
  const file = statSync(path);
  if (!file.isFile() || file.size > MAX_INDEX_BYTES || file.size < 1024) throw new Error("Knowledge index size is invalid");
  // One startup hash keeps a truncated or swapped release index from being read.
  const hash = createHash("sha256");
  for await (const block of createReadStream(path)) hash.update(block);
  const digest = hash.digest("hex");
  if (digest !== meta.sqliteSha256) throw new Error("Knowledge index checksum mismatch");
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    database.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-8192; PRAGMA mmap_size=0");
    if (database.prepare("SELECT count(*) AS n FROM chunks").get()?.n !== meta.indexedChunks) {
      throw new Error("Knowledge index row count mismatch");
    }
    const entry = { database, indexSha256: digest, manifest };
    cached.set(path, entry);
    return entry;
  } catch (error) { database.close(); throw error; }
}

export function indexedKnowledgeEnabled() { return Boolean(process.env.VIBEHARD_OSS_INDEX_PATH); }

function boardRows(database: DatabaseSync, board: string, queryTerms: string[], preferred: string, associations: BoardAssociations) {
  const entries = (associations.boards[board] ?? []).filter(entry => preferred !== "schematics" ||
    entry.category === "schematics" || entry.citationPath.includes("/1. 硬件资料/"));
  if (!entries.length) return { rows: [] as IndexRow[], citationPaths: new Map<string, string>() };
  if (entries.length > MAX_BOARD_ASSOCIATIONS || entries.some(entry => !/^[a-f0-9]{64}$/.test(entry.sourceSha256))) {
    throw new Error("Board index associations are invalid");
  }
  const citationPaths = new Map(entries.map(entry => [entry.sourceSha256, entry.citationPath]));
  const shas = [...citationPaths.keys()];
  const placeholders = shas.map(() => "?").join(",");
  // A deduplicated document can have its canonical path under another board.
  // Filter by verified file hashes, not by that arbitrary canonical path.
  const initial = database.prepare(`WITH ranked AS (
      SELECT id, source_sha, source_path, category, page, part, text,
        row_number() OVER (PARTITION BY source_sha ORDER BY page, part) AS file_rank
      FROM chunks WHERE source_sha IN (${placeholders})
    ) SELECT id, source_sha, source_path, category, page, part, text FROM ranked
    WHERE file_rank <= ${MAX_PER_FILE}`).all(...shas) as IndexRow[];
  const contentTerms = queryTerms.filter(term => term !== board.toLocaleLowerCase());
  const relevant = contentTerms.length
    ? database.prepare(`SELECT chunks.id, chunks.source_sha, chunks.source_path, chunks.category,
        chunks.page, chunks.part, chunks.text FROM chunks_fts JOIN chunks ON chunks_fts.rowid=chunks.rowid
        WHERE chunks_fts MATCH ? AND chunks.source_sha IN (${placeholders})
        ORDER BY bm25(chunks_fts) LIMIT ${MAX_CANDIDATES * 2}`)
      .all(contentTerms.map(term => `text:${JSON.stringify(term)}`).join(" OR "), ...shas) as IndexRow[]
    : [];
  const relevantIds = new Set(relevant.map(row => row.id));
  const categoryScore = (row: IndexRow) => {
    const path = citationPaths.get(row.source_sha) ?? "";
    if (preferred === "schematics" && (row.category === "schematics" || path.includes("/1. 硬件资料/"))) return 0;
    if (preferred && row.category === preferred) return 0;
    return 1;
  };
  const unique = new Map<string, IndexRow>();
  for (const row of [...relevant, ...initial]) unique.set(row.id, row);
  const sorted = [...unique.values()].sort((a, b) =>
    categoryScore(a) - categoryScore(b) ||
    Number(relevantIds.has(b.id)) - Number(relevantIds.has(a.id)) ||
    Number((citationPaths.get(a.source_sha) ?? "").includes("!")) - Number((citationPaths.get(b.source_sha) ?? "").includes("!")) ||
    (citationPaths.get(a.source_sha) ?? "").localeCompare(citationPaths.get(b.source_sha) ?? "") || a.page - b.page || a.part - b.part);
  // Offer one chunk per distinct file before a second page from any file.
  const rows: IndexRow[] = [];
  const counts = new Map<string, number>();
  const used = new Set<string>();
  for (let pass = 0; pass < MAX_PER_FILE; pass++) {
    for (const row of sorted) {
      if (used.has(row.id) || (counts.get(row.source_sha) ?? 0) !== pass) continue;
      counts.set(row.source_sha, pass + 1);
      used.add(row.id);
      rows.push(row);
      if (rows.length >= MAX_CANDIDATES) return { rows, citationPaths };
    }
  }
  return { rows, citationPaths };
}

export async function searchIndexedKnowledge(requirement: string, indexPath = process.env.VIBEHARD_OSS_INDEX_PATH,
    associations: BoardAssociations = boardAssociations): Promise<RetrievalSource[]> {
  if (!indexPath) return [];
  // Open only the operator-selected immutable path. Versioned v2 policy is
  // checked before interpreting source/board associations; legacy remains exact.
  if (!opening.has(indexPath)) {
    const promise = openIndex(indexPath).finally(() => { opening.delete(indexPath); });
    opening.set(indexPath, promise);
  }
  const entry = await opening.get(indexPath)!;
  const database = entry.database;
  if (entry.manifest) {
    const queryTerms = terms(requirement);
    return queryTerms.length ? searchControlledIndex(database, entry.manifest, requirement, queryTerms) : [];
  }
  // An explicit different board must never pick up ESP32-S3 corpus fragments.
  if (/\brv1106\b|\brv1126b\b/i.test(requirement) && !/\besp32[- ]?s3\b/i.test(requirement)) return [];
  const board = requestedBoard(requirement);
  // A named, unknown variant must not silently fall back to a similar board.
  const explicitBoards = requirement.match(/\bESP32-S3-[A-Za-z0-9][A-Za-z0-9._-]*/gi) ?? [];
  if (explicitBoards.some(name => !boardNames.some(known => known.toLowerCase() === name.toLowerCase()))) return [];
  const queryTerms = terms(requirement);
  if (!board && !queryTerms.length) return [];
  // Quoted terms are passed as SQLite parameters; no user-controlled path or
  // identifier is interpolated into SQL. Board hash lists are bundled evidence.
  const query = queryTerms.map(term => `text:${JSON.stringify(term)}`).join(" OR ");
  if (associations.indexSha256 !== entry.indexSha256 || associations.manifestSha256 !== APPROVED_MANIFEST_SHA) {
    throw new Error("Board associations do not match the approved knowledge index");
  }
  const boardMatches = board ? boardRows(database, board, queryTerms, preferredCategory(requirement), associations) : undefined;
  const rows = boardMatches?.rows ?? database.prepare(`SELECT chunks.id, chunks.source_sha, chunks.source_path, chunks.category,
        chunks.page, chunks.part, chunks.text FROM chunks_fts JOIN chunks ON chunks_fts.rowid=chunks.rowid
        WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ${MAX_CANDIDATES}`).all(query) as IndexRow[];
  const associatedShas = associations === boardAssociations ? approvedAssociatedShas
    : new Set(Object.values(associations.boards).flat().map(entry => entry.sourceSha256));
  const byFile = new Map<string, number>();
  const result: RetrievalSource[] = [];
  for (const row of rows) {
    // The only approved index document without a verified board association is
    // a misfiled Touch schematic; do not expose it through generic searches.
    if (!board && !associatedShas.has(row.source_sha)) continue;
    const citationPath = boardMatches?.citationPaths.get(row.source_sha) ?? row.source_path;
    if (!/^[a-f0-9]{64}$/.test(row.source_sha) || !row.source_path || row.source_path.startsWith("/") ||
        row.source_path.split("/").includes("..") || !Number.isInteger(row.page) || row.page < 1 ||
        !Number.isInteger(row.part) || row.part < 1 || typeof row.text !== "string" || row.text.length > 1800 ||
        !citationPath || citationPath.startsWith("/") || citationPath.split("/").includes("..") ||
        (board && !citationPath.includes(`/${board}/`))) continue;
    const count = byFile.get(row.source_sha) ?? 0;
    if (count >= MAX_PER_FILE) continue;
    byFile.set(row.source_sha, count + 1);
    result.push({ scope: "platform", id: referenceId(row.id), reviewStatus: "auto-indexed",
      version: { title: citationPath.split("/").at(-1) ?? citationPath,
        source: `${citationPath}#page=${row.page}&part=${row.part}`, kind: "manual", content: row.text,
        version: 1, sha256: row.source_sha, reviewedBy: "automatic_rules_v1", reviewedAt: "2026-09-26T00:00:00.000Z" } });
    if (result.length >= MAX_SOURCES) break;
  }
  return result;
}

export function closeIndexedKnowledge() { for (const entry of cached.values()) entry.database.close(); cached.clear(); }
