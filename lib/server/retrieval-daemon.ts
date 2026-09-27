import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { searchIndexedKnowledge } from "./oss-knowledge-index";

export function indexPolicy(indexPath: string) {
  const meta = z.object({ sqliteSha256: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(readFileSync(`${indexPath}.meta.json`, "utf8")));
  const file = process.env.VIBEHARD_DISABLED_SOURCES_FILE;
  const disabled = file ? z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10000).parse(JSON.parse(readFileSync(file, "utf8"))) : [];
  return { disabled: new Set(disabled), revision: createHash("sha256").update(JSON.stringify([meta.sqliteSha256, [...disabled].sort()])).digest("hex") };
}
export function createRetrievalServer(indexPath: string, search = searchIndexedKnowledge, policy = indexPolicy) {
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
      const current = policy(indexPath);
      const sources = (await search(query, indexPath)).filter(source => !current.disabled.has(source.version.sha256));
      reply(200, { sources, revision: current.revision });
    } catch { if (!res.headersSent) reply(503, { error: "INDEX_UNAVAILABLE" }); }
    finally { active--; }
  });
  server.requestTimeout = 2000; server.headersTimeout = 2000; server.timeout = 2000; server.maxConnections = 16;
  return server;
}
