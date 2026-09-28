import { setTimeout } from "node:timers/promises";
import { closeDb, configureWorkerDatabaseTimeouts, requireDb } from "@/lib/db";
import { DesignStorageUnavailableError, processNextDesign } from "@/lib/server/design-job-worker";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  configureWorkerDatabaseTimeouts();
  requireDb();
  console.log("Design worker ready; concurrency=1, no automatic model retries");
  try {
    while (!stopping) {
      try { await processNextDesign(); }
      catch (error) {
        // Promise deadlines cannot cancel an in-flight SQL query. Destroy this
        // worker's connections and let systemd restart; never accumulate work.
        if (error instanceof DesignStorageUnavailableError) throw error;
        console.error("Design worker storage unavailable; pending jobs retained");
      }
      if (!stopping) await setTimeout(2000);
    }
  } finally { await closeDb(1); }
}
void main().catch(() => { console.error("Design worker stopped: database unavailable or storage deadline exceeded; pending jobs retained"); process.exitCode = 1; });
