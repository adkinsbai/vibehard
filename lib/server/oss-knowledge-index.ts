import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { RetrievalSource } from "@/lib/agent/knowledge-retrieval";

// This is an internal, read-only service used by the single-concurrency design
// worker after project ownership has been checked. No browser route or OSS key
// is exposed. Production grants file read only to the worker's Unix group.
const MAX_QUERY_TERMS = 12;
const MAX_CANDIDATES = 24;
const MAX_SOURCES = 12;
const MAX_PER_FILE = 2;
const MAX_INDEX_BYTES = 256 * 1024 * 1024;
const INDEX_BATCH = "6cf96eea-af45-4e7d-96c0-c99afbe8c192";
const APPROVED_MANIFEST_SHA = "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1";

type IndexRow = { id: string; source_sha: string; source_path: string; category: string; page: number; part: number; text: string };
type IndexMetadata = { batchId: string; manifestSha256: string; sqliteSha256: string; indexedChunks: number };
let cached: { path: string; database: DatabaseSync } | undefined;
let opening: Promise<DatabaseSync> | undefined;

function terms(requirement: string) {
  const lowered = requirement.toLocaleLowerCase();
  const words = lowered.match(/[a-z0-9][a-z0-9._+-]{2,}/g) ?? [];
  const han = (lowered.match(/[\p{Script=Han}]{3,}/gu) ?? []).flatMap(run => {
    const chars = [...run];
    return chars.slice(0, -2).map((_, i) => chars.slice(i, i + 3).join(""));
  });
  return [...new Set([...words, ...han])].slice(0, MAX_QUERY_TERMS);
}

function referenceId(chunkId: string) {
  const hex = createHash("sha256").update(`${INDEX_BATCH}:${chunkId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function openIndex(path: string) {
  if (cached?.path === path) return cached.database;
  cached?.database.close();
  cached = undefined;
  const meta = JSON.parse(readFileSync(`${path}.meta.json`, "utf8")) as IndexMetadata;
  if (meta.batchId !== INDEX_BATCH || meta.manifestSha256 !== APPROVED_MANIFEST_SHA ||
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
    cached = { path, database };
    return database;
  } catch (error) { database.close(); throw error; }
}

export function indexedKnowledgeEnabled() { return Boolean(process.env.VIBEHARD_OSS_INDEX_PATH); }

export async function searchIndexedKnowledge(requirement: string, indexPath = process.env.VIBEHARD_OSS_INDEX_PATH): Promise<RetrievalSource[]> {
  if (!indexPath) return [];
  // An explicit different board must never pick up ESP32-S3 corpus fragments.
  if (/\brv1106\b|\brv1126b\b/i.test(requirement) && !/\besp32[- ]?s3\b/i.test(requirement)) return [];
  const queryTerms = terms(requirement);
  if (!queryTerms.length) return [];
  // Quoted terms are passed as a single SQLite parameter; no caller-controlled
  // SQL identifiers, paths, or unbounded offsets enter the query.
  const query = queryTerms.map(term => `text:${JSON.stringify(term)}`).join(" OR ");
  opening ??= openIndex(indexPath).finally(() => { opening = undefined; });
  const rows = (await opening).prepare(`SELECT chunks.id, chunks.source_sha, chunks.source_path, chunks.category,
    chunks.page, chunks.part, chunks.text FROM chunks_fts JOIN chunks ON chunks_fts.rowid=chunks.rowid
    WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ${MAX_CANDIDATES}`).all(query) as IndexRow[];
  const byFile = new Map<string, number>();
  const result: RetrievalSource[] = [];
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/.test(row.source_sha) || !row.source_path || row.source_path.startsWith("/") ||
        row.source_path.split("/").includes("..") || !Number.isInteger(row.page) || row.page < 1 ||
        !Number.isInteger(row.part) || row.part < 1 || typeof row.text !== "string" || row.text.length > 1800) continue;
    const count = byFile.get(row.source_sha) ?? 0;
    if (count >= MAX_PER_FILE) continue;
    byFile.set(row.source_sha, count + 1);
    result.push({ scope: "platform", id: referenceId(row.id), reviewStatus: "auto-indexed",
      version: { title: row.source_path.split("/").at(-1) ?? row.source_path,
        source: `${row.source_path}#page=${row.page}&part=${row.part}`, kind: "manual", content: row.text,
        version: 1, sha256: row.source_sha, reviewedBy: "automatic_rules_v1", reviewedAt: "2026-09-26T00:00:00.000Z" } });
    if (result.length >= MAX_SOURCES) break;
  }
  return result;
}

export function closeIndexedKnowledge() { cached?.database.close(); cached = undefined; }
