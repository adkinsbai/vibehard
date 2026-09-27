import { setTimeout } from "node:timers/promises";
import { closeDb, requireDb } from "@/lib/db";
import { processNextDesign } from "@/lib/server/design-job-worker";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  requireDb();
  console.log("Design worker ready; concurrency=1, no automatic model retries");
  try {
    while (!stopping) {
      try { await processNextDesign(); }
      catch { console.error("Design worker storage unavailable; pending jobs retained"); }
      if (!stopping) await setTimeout(2000);
    }
  } finally { await closeDb(); }
}
void main().catch(() => { console.error("Design worker failed to start; check DATABASE_URL and migration"); process.exitCode = 1; });
