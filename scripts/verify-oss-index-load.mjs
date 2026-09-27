import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const index = process.argv[2];
assert.equal(index, "/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite");
const db = new DatabaseSync(index, { readOnly: true });
try {
  db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-8192; PRAGMA mmap_size=0");
  assert.equal(db.prepare("select count(*) as n from chunks").get().n, 20582);
  const statement = db.prepare("SELECT chunks.source_sha, chunks.source_path, chunks.page, chunks.part, chunks.text FROM chunks_fts JOIN chunks ON chunks_fts.rowid=chunks.rowid WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT 24");
  const searches = ['text:"esp32-s3" OR text:"触摸屏"', 'text:"sim7670" OR text:"通信"', 'text:"esp32-s3" OR text:"gpio"'];
  const elapsed = [];
  for (let i = 0; i < 90; i++) {
    const start = performance.now();
    const hits = statement.all(searches[i % searches.length]);
    elapsed.push(performance.now() - start);
    assert.ok(hits.length > 0 && hits.length <= 24);
    assert.ok(hits.every(hit => /^[a-f0-9]{64}$/.test(hit.source_sha) && hit.page >= 1 && hit.part >= 1 && hit.text.length <= 1800));
  }
  const sorted = elapsed.slice(1).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const rss = process.memoryUsage().rss;
  assert.ok(p95 < 500, `Cloud warm p95 too high: ${p95.toFixed(1)}ms`);
  assert.ok(rss < 384 * 1024 * 1024, "Worker RSS limit exceeded");
  console.log(JSON.stringify({ queries: 90, warmP95Ms: Math.round(p95), rssMiB: Math.round(rss / 1024 / 1024),
    boundedResults: true, citationFieldsPresent: true }));
} finally { db.close(); }
