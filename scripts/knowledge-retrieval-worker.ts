import { chmodSync, existsSync, readFileSync } from "node:fs";
import { z } from 'zod';
import { createRetrievalServer, indexPolicy } from "@/lib/server/retrieval-daemon";
import { closeIndexedKnowledge, searchIndexedKnowledge } from "@/lib/server/oss-knowledge-index";

async function main() {
  const control = process.env.VIBEHARD_INDEX_CONTROL;
  const index = control ? z.object({ path: z.string().regex(/^\/opt\/vibehard\/knowledge\/[A-Za-z0-9/_-]+\/knowledge-fts\.sqlite$/) }).parse(JSON.parse(readFileSync(control, 'utf8'))).path : process.env.VIBEHARD_OSS_INDEX_PATH;
  const socket = process.env.VIBEHARD_RETRIEVAL_SOCKET;
  if (!index || !socket || !socket.startsWith("/") || !socket.endsWith(".sock")) throw new Error("Missing private index/socket configuration");
  // Verify/warm before accepting traffic. No public listening address exists.
  await searchIndexedKnowledge("indexwarmup", index); indexPolicy(index);
  // systemd owns RuntimeDirectory and removes stale sockets on a clean stop.
  // Never unlink another running worker's listener.
  if (existsSync(socket)) throw new Error("Socket already exists; refusing to replace it");
  const server = createRetrievalServer(index);
  server.listen(socket, () => { chmodSync(socket, 0o660); console.log("Private knowledge worker ready; concurrency=2; no TCP listener"); });
  const stop = () => server.close(() => { closeIndexedKnowledge(); process.exit(0); });
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
void main().catch(() => { console.error("Private knowledge worker unavailable; inspect immutable index/configuration"); process.exitCode = 1; });
