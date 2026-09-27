import { chmodSync, existsSync, readFileSync } from "node:fs";
import { z } from 'zod';
import { createRetrievalServer, indexPolicy } from "@/lib/server/retrieval-daemon";
import { closeIndexedKnowledge, searchIndexedKnowledge } from "@/lib/server/oss-knowledge-index";
import { checkIndexSetBudget, indexSet } from '@/lib/server/knowledge-index-set';

async function main() {
  const control = process.env.VIBEHARD_INDEX_CONTROL;
  const selected = control ? indexSet(JSON.parse(readFileSync(control, 'utf8'))) : indexSet({id:'legacy-20260926',path:process.env.VIBEHARD_OSS_INDEX_PATH});
  const paths = selected.indexes.map(entry=>z.string().regex(/^\/opt\/vibehard\/knowledge\/[A-Za-z0-9/_-]+\/knowledge-fts\.sqlite$/).parse(entry.path));
  checkIndexSetBudget(selected);
  const socket = process.env.VIBEHARD_RETRIEVAL_SOCKET;
  if (!socket || !socket.startsWith("/") || !socket.endsWith(".sock")) throw new Error("Missing private index/socket configuration");
  // Verify/warm before accepting traffic. No public listening address exists.
  for(const index of paths) { await searchIndexedKnowledge("indexwarmup", index); indexPolicy(index); }
  // systemd owns RuntimeDirectory and removes stale sockets on a clean stop.
  // Never unlink another running worker's listener.
  if (existsSync(socket)) throw new Error("Socket already exists; refusing to replace it");
  const server = createRetrievalServer(paths);
  server.listen(socket, () => { chmodSync(socket, 0o660); console.log("Private knowledge worker ready; concurrency=2; no TCP listener"); });
  const stop = () => server.close(() => { closeIndexedKnowledge(); process.exit(0); });
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
void main().catch(() => { console.error("Private knowledge worker unavailable; inspect immutable index/configuration"); process.exitCode = 1; });
