#!/usr/bin/env tsx
// Read-only regression audit for the approved local ESP32-S3 FTS artifact.
import { DatabaseSync } from "node:sqlite";
import boardSpecifications from "../lib/server/data/board-spec-evidence.json";
import boardAssociations from "../lib/server/data/oss-rag-board-associations.json";
import { closeIndexedKnowledge, searchIndexedKnowledge } from "../lib/server/oss-knowledge-index";

const indexPath = process.argv[2];
if (!indexPath) throw new Error("Usage: tsx scripts/verify-oss-rag-board-retrieval.ts <index.sqlite>");
const associations: Record<string, { sourceSha256: string; citationPath: string; category: string }[]> = boardAssociations.boards;

async function main() {
  const database = new DatabaseSync(indexPath, { readOnly: true });
  database.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF");
  const position = database.prepare("SELECT 1 FROM chunks WHERE source_sha=? AND page=? AND part=? LIMIT 1");
  const durations: number[] = [];
  let queries = 0;
  let withHits = 0;
  let empty = 0;
  let references = 0;
  const emptyQueries: string[] = [];
  try {
  for (const board of boardSpecifications.boards) {
    const excluded = new Set<string>(board.excludedResources);
    for (const intent of ["原理图", "开发方案"]) {
      const start = performance.now();
      const hits = await searchIndexedKnowledge(`${board.name} ${intent}`, indexPath);
      durations.push(performance.now() - start);
      queries++;
      if (hits.length) withHits++; else { empty++; emptyQueries.push(`${board.name} ${intent}`); }
      if (hits.length > 12) throw new Error(`Unbounded retrieval: ${board.name}`);
      const perFile = new Map<string, number>();
      for (const hit of hits) {
        references++;
        const match = /^(.+)#page=(\d+)&part=(\d+)$/.exec(hit.version.source);
        const association = associations[board.name]?.find(entry => entry.sourceSha256 === hit.version.sha256);
        if (!match || !match[1].includes(`/${board.name}/`) || association?.citationPath !== match[1] ||
            excluded.has(match[1]) ||
            !position.get(hit.version.sha256, Number(match[2]), Number(match[3]))) {
          throw new Error(`Invalid board citation: ${board.name}: ${hit.version.source}`);
        }
        perFile.set(hit.version.sha256, (perFile.get(hit.version.sha256) ?? 0) + 1);
        if (perFile.get(hit.version.sha256)! > 2) throw new Error(`One file dominates: ${board.name}`);
      }
    }
  }
  durations.sort((a, b) => a - b);
  const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
  const rssMiB = process.memoryUsage().rss / 1024 / 1024;
  if (p95Ms > 500 || rssMiB > 384) throw new Error(`RAG load limit exceeded: p95=${p95Ms.toFixed(1)}ms rss=${rssMiB.toFixed(1)}MiB`);
  console.log(JSON.stringify({ boards: boardSpecifications.boards.length, queries, withHits, empty,
    references, emptyQueries, p95Ms: Number(p95Ms.toFixed(1)), rssMiB: Number(rssMiB.toFixed(1)),
    excludedPathsChecked: boardSpecifications.boards.reduce((n, board) => n + board.excludedResources.length, 0) }, null, 2));
  } finally {
    closeIndexedKnowledge();
    database.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
