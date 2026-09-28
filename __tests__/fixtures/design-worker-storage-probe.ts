// Child-process probe: real isolated PostgreSQL storage, no model/provider access.
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { closeDb, configureWorkerDatabaseTimeouts, requireDb } from '../../lib/db';
import { designJobs } from '../../lib/db/schema';
import { finishDesign, saveDesignDiagnostics } from '../../lib/server/design-job-store';
import { processNextDesign } from '../../lib/server/design-job-worker';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/vibehard_design_test');
  assert.equal(process.env.VIBEHARD_DESIGN_TEST_DATABASE, '1');
  configureWorkerDatabaseTimeouts();
  const [job] = await requireDb().select().from(designJobs).where(eq(designJobs.id, process.argv[2]));
  assert.equal(job.status, 'running');
  let downstreamCalls = 0;
  const forbidden = async (): Promise<never> => { downstreamCalls++; throw Error('MODEL_ACCESS_FORBIDDEN'); };
  const configProbe = process.argv[3] === 'config';
  const budgetMs = configProbe ? 4000 : 1000;
  const runtimeLlm = configProbe ? async (): Promise<never> => {
    await requireDb().execute(sql`select pg_sleep(60)`); throw Error('LATE_CONFIG_SHOULD_BE_CANCELLED');
  } : forbidden;
  const start = Date.now(); let elapsedMs = 0; let errorName = '';
  try {
    await processNextDesign({ claimDesign: async () => job, finishDesign, saveDesignDiagnostics,
      runtimeLlm, retrieveDesignKnowledge: forbidden, callLlm: forbidden }, budgetMs);
  } catch (error) {
    elapsedMs = Date.now() - start; errorName = (error as Error).name;
  } finally {
    // Same forced pool shutdown used by scripts/design-worker.ts.
    await closeDb(1);
  }
  assert.equal(errorName, 'DesignStorageUnavailableError');
  assert.equal(downstreamCalls, 0);
  assert.ok(elapsedMs < budgetMs + 500);
  console.log(JSON.stringify({ errorName, elapsedMs, closedAfterMs: Date.now() - start }));
}
void main().catch(() => { console.error('ISOLATED_WORKER_PROBE_FAILED'); process.exitCode = 1; });
