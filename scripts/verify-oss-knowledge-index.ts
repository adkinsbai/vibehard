import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { retrieveKnowledge } from "@/lib/agent/knowledge-retrieval";
import { closeIndexedKnowledge, searchIndexedKnowledge } from "@/lib/server/oss-knowledge-index";

const indexPath = process.argv[2];
assert.ok(indexPath?.startsWith("/"), "Pass an absolute, local index path");
const database = new DatabaseSync(indexPath, { readOnly: true });
const requests = ["ESP32-S3 触摸屏 I2C", "ESP32-S3 SIM7670 4G 通信", "ESP32-S3 GPIO 开发板"];
const timings: number[] = [];
async function main() {
try {
  for (let index = 0; index < 90; index++) {
    const query = requests[index % requests.length];
    const start = performance.now();
    const sources = await searchIndexedKnowledge(query, indexPath);
    timings.push(performance.now() - start);
    assert.ok(sources.length > 0 && sources.length <= 12, `No bounded source for ${query}`);
    const result = retrieveKnowledge(query, sources);
    assert.equal(result.status, "matched");
    assert.equal(result.method, "keyword-chunks-fts5-v1");
    assert.ok(result.references.length > 0 && result.references.length <= 5);
    assert.ok(result.context.length <= 3200);
    for (const reference of result.references) {
      assert.equal(reference.reviewStatus, "auto-indexed");
      const match = reference.source.match(/^(.*)#page=(\d+)&part=(\d+)$/);
      assert.ok(match, "Page and part required");
      const row = database.prepare("SELECT text FROM chunks WHERE source_sha=? AND source_path=? AND page=? AND part=?")
        .get(reference.sha256, match[1], Number(match[2]), Number(match[3]));
      assert.ok(row && typeof row.text === "string" && row.text.includes(reference.excerpt), "Citation must match indexed source text");
    }
  }
  const sorted = timings.slice(1).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  assert.ok(p95 < 500, `Warm index search p95 too high: ${p95.toFixed(1)} ms`);
  assert.ok(process.memoryUsage().rss < 256 * 1024 * 1024, "Index query process exceeds worker memory budget");
  console.log(JSON.stringify({ queries: timings.length, coldMs: Math.round(timings[0]), warmP95Ms: Math.round(p95),
    rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024), citationVerification: true }));
} finally { database.close(); closeIndexedKnowledge(); }
}
void main();
