// Local-only HTTP/independent-worker smoke check; no real LLM credentials or calls.
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { closeDb, requireDb } from "@/lib/db";
import { llmSettings, users } from "@/lib/db/schema";
import { createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import type { DesignJob } from "@/lib/agent/design-jobs";

async function main() {
  assert.equal(process.env.VIBEHARD_DESIGN_TEST_DATABASE, "1");
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/vibehard_design_test");
  assert.equal(database.port, "15439");
  const base = "http://127.0.0.1:3211/vibehard";
  assert.equal((await requireDb().select().from(llmSettings).where(eq(llmSettings.purpose, "design"))).length, 0, "Smoke test must not have real model credentials");
  const ids: string[] = [];
  try {
    const owner = await createUser({ email: `local-design-${crypto.randomUUID()}@example.invalid`, passwordHash: "not-a-login-password", inviteCode: "fixture" }); ids.push(owner.id);
    const stranger = await createUser({ email: `local-design-${crypto.randomUUID()}@example.invalid`, passwordHash: "not-a-login-password", inviteCode: "fixture" }); ids.push(stranger.id);
    const cookie = `vibehard_session=${createSessionToken(owner)}`;
    const request = (path: string, init?: RequestInit) => fetch(base + path, { ...init, headers: { Cookie: cookie, "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(10_000) });
    const input = { requestId: crypto.randomUUID(), requirement: "本地 HTTP 持久化验收，不调用真实模型" };
    const response = await request("/api/design", { method: "POST", body: JSON.stringify(input) }); assert.equal(response.status, 202);
    const { job } = await response.json() as { job: DesignJob }; assert.equal(job.status, "queued");
    const duplicate = await request("/api/design", { method: "POST", body: JSON.stringify(input) }); assert.equal((await duplicate.json()).job.id, job.id);
    const list = await (await request("/api/projects")).json(); assert.ok(list.projects.some((p: { id: string }) => p.id === job.projectId));
    assert.equal((await request(`/app/agent/${job.projectId}/designs`)).status, 200);
    const outsider = await request(`/api/design/${job.id}`, { headers: { Cookie: `vibehard_session=${createSessionToken(stranger)}` } }); assert.equal(outsider.status, 404);
    let saved = job; const deadline = Date.now() + 15_000;
    while (["queued", "running"].includes(saved.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500));
      saved = (await (await request(`/api/design/${job.id}`)).json()).job;
    }
    assert.equal(saved.status, "failed", "Start dist/services/design-worker.cjs against the disposable DB before this test");
    assert.match(saved.error ?? "", /尚未配置/); assert.equal(saved.requirement, input.requirement);
    const history = await (await request(`/api/design?projectId=${job.projectId}`)).json(); assert.equal(history.jobs[0].id, job.id);
    console.log(JSON.stringify({ http: true, projectCreated: true, idempotent: true, independentWorker: true, failureRetained: true, tenantIsolation: true, realModelCalled: false }));
  } finally { if (ids.length) await requireDb().delete(users).where(inArray(users.id, ids)); await closeDb(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
