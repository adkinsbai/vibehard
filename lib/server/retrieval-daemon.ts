import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { searchIndexedKnowledge } from "./oss-knowledge-index";
import type { RetrievalSource } from '@/lib/agent/knowledge-retrieval';
import { MAX_ACTIVE_INDEXES } from './knowledge-index-set';

export function indexPolicy(indexPath: string) {
  const meta = z.object({ sqliteSha256: z.string().regex(/^[a-f0-9]{64}$/), manifestSha256: z.string().optional() }).parse(JSON.parse(readFileSync(`${indexPath}.meta.json`, "utf8")));
  const file = process.env.VIBEHARD_DISABLED_SOURCES_FILE;
  const disabled = file ? z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10000).parse(JSON.parse(readFileSync(file, "utf8"))) : [];
  return { disabled: new Set(disabled), revision: createHash("sha256").update(JSON.stringify([meta.sqliteSha256, meta.manifestSha256 ?? null, [...disabled].sort()])).digest("hex") };
}
export function indexSetPolicy(paths: readonly string[], policy = indexPolicy) {
  if (!paths.length || paths.length > MAX_ACTIVE_INDEXES) throw Error('ACTIVE_INDEX_LIMIT');
  const policies = paths.map(path=>policy(path));
  return { disabled: new Set(policies.flatMap(p=>[...p.disabled])), revision: policies.length === 1 ? policies[0].revision
    : createHash('sha256').update(JSON.stringify(policies.map(p=>p.revision))).digest('hex') };
}
export async function searchIndexSet(query: string, paths: readonly string[], disabled: Set<string>, search = searchIndexedKnowledge) {
  if (!paths.length || paths.length > MAX_ACTIVE_INDEXES) throw Error('ACTIVE_INDEX_LIMIT');
  const groups: RetrievalSource[][] = [];
  // Sequential scans and bounded handles keep CPU/RSS predictable. Do not let
  // the first batch consume every reference when the query spans batches.
  for (const path of paths) groups.push((await search(query,path)).filter(s=>!disabled.has(s.version.sha256)));
  const result: RetrievalSource[]=[]; const seen=new Set<string>(); const counts=new Map<string,number>();
  for (let i=0;i<12;i++) for (const group of groups) {
    const source=group[i]; if (!source) continue;
    const sha=source.version.sha256; const key=JSON.stringify([sha,source.version.content]);
    if (seen.has(key) || (counts.get(sha)??0)>=2) continue;
    seen.add(key); counts.set(sha,(counts.get(sha)??0)+1); result.push(source);
    if(result.length===12) return result;
  }
  return result;
}
export function createRetrievalServer(indexPath: string | readonly string[], search = searchIndexedKnowledge, policy = indexPolicy) {
  const paths=typeof indexPath === 'string' ? [indexPath] : [...indexPath];
  let active = 0;
  const server = createServer(async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    if (req.method !== "POST" || req.url !== "/query") { reply(404, { error: "NOT_FOUND" }); req.resume(); return; }
    if (active >= 2) { reply(503, { error: "BUSY" }); req.resume(); return; }
    active++;
    try {
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const value of req) { const chunk = Buffer.from(value); bytes += chunk.length; if (bytes > 64000) { reply(413, { error: "LIMIT" }); return; } chunks.push(chunk); }
      const { query } = z.object({ query: z.string().min(1).max(12000) }).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const current = indexSetPolicy(paths, policy);
      const sources = await searchIndexSet(query, paths, current.disabled, search);
      reply(200, { sources, revision: current.revision });
    } catch { if (!res.headersSent) reply(503, { error: "INDEX_UNAVAILABLE" }); }
    finally { active--; }
  });
  server.requestTimeout = 2000; server.headersTimeout = 2000; server.timeout = 2000; server.maxConnections = 16;
  return server;
}
