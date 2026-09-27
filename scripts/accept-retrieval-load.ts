import assert from 'node:assert/strict';
import { queryPrivateIndex } from '@/lib/server/retrieval-client';
const timings: number[] = []; let failures = 0;
async function main() {
  assert.ok(process.env.VIBEHARD_RETRIEVAL_SOCKET?.includes('candidate'));
  for (let group = 0; group < 30; group++) await Promise.all([0, 1].map(async offset => {
    const start = performance.now();
    const result = await queryPrivateIndex(offset ? 'ESP32-S3-Touch-LCD-2.8C 原理图' : 'ESP32-S3-Touch-AMOLED-1.43 原理图');
    timings.push(performance.now() - start);
    if (!result.sources.length || result.sources.length > 12 || result.sources.some(s => s.reviewStatus !== 'auto-indexed' || !/#page=\d+&part=\d+$/.test(s.version.source))) failures++;
  }));
  timings.sort((a, b) => a - b); const p95Ms = timings[Math.ceil(timings.length * .95) - 1];
  console.log(JSON.stringify({ acceptance: 'private-retrieval-load-v1', concurrency: 2, requests: timings.length, p95Ms, maxMs: timings.at(-1), failures, passed: p95Ms < 500 && failures === 0 }));
  assert.ok(p95Ms < 500 && failures === 0);
}
void main().catch(() => { console.error('Private retrieval load gate failed'); process.exitCode = 1; });
