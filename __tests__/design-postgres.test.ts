// @vitest-environment node
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireDb } from "@/lib/db";
import { designJobs, projects, users } from "@/lib/db/schema";
import { createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import { claimDesign, enqueueDesign, finishDesign, getDesign, listDesigns, listDesignDiagnostics, saveDesignDiagnostics } from "@/lib/server/design-job-store";
import { GET as detail } from "@/app/api/design/[id]/route";
import { GET as download } from "@/app/api/design/[id]/download/route";
import { POST } from "@/app/api/design/route";
import { processNextDesign } from "@/lib/server/design-job-worker";
import { callLlm, LlmRequestError } from "@/lib/server/llm-client";
vi.mock("@/lib/server/llm-settings", () => ({ runtimeLlm: vi.fn().mockResolvedValue({ model: "isolated-test", baseUrl: "https://example.invalid", apiKey: "fixture-not-real", protocol: "responses" }), publicLlm: vi.fn() }));
vi.mock("@/lib/server/llm-client", async original => ({ ...await original<typeof import("@/lib/server/llm-client")>(), callLlm: vi.fn() }));

// Never run against a normal DATABASE_URL. Requires a disposable local cluster.
const enabled = process.env.VIBEHARD_DESIGN_TEST_DATABASE === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/vibehard_design_test") throw new Error("Refusing non-disposable design test database");
}
(enabled ? describe : describe.skip)("durable design queue PostgreSQL", () => {
  const created: string[] = [];
  async function user() {
    const value = await createUser({ email: `design-${randomUUID()}@example.invalid`, passwordHash: "test", inviteCode: "test" });
    created.push(value.id); return value;
  }
  afterEach(async () => { if (created.length) await requireDb().delete(users).where(inArray(users.id, created.splice(0))); });
  const input = () => ({ requestId: randomUUID(), requirement: "带温度传感器的 USB 节点" });
  const result = { architecture: ["持久化架构"], bom: [{ item: "主控", model: "MCU", qty: 1, estCost: "¥5（估算）" }], interfaces: ["UART"], risks: [{ level: "低" as const, desc: "核验" }] };
  const req = (record: Awaited<ReturnType<typeof user>>, body?: unknown) => new NextRequest("https://example.invalid/api/design", { method: body ? "POST" : "GET", headers: { Cookie: `vibehard_session=${createSessionToken(record)}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it("atomically creates one project for concurrent retries, and enforces idempotency and per-user limits", async () => {
    const owner = await user(); const request = input();
    const replies = await Promise.all(Array.from({ length: 8 }, () => enqueueDesign(owner.id, request)));
    expect(new Set(replies.map(job => job.id)).size).toBe(1);
    expect(await requireDb().select().from(projects).where(eq(projects.userId, owner.id))).toHaveLength(1);
    await expect(enqueueDesign(owner.id, { ...request, requirement: "不同的需求" })).rejects.toThrow("提交编号");
    await expect(enqueueDesign(owner.id, input())).rejects.toThrow("已有一个");
  });
  it("isolates listing, association, details and downloads, including authenticated outsiders", async () => {
    const owner = await user(); const outsider = await user(); const job = await enqueueDesign(owner.id, input());
    expect(await getDesign(outsider.id, job.id)).toBeNull();
    expect((await listDesigns(outsider.id, job.projectId)).jobs).toHaveLength(0);
    await expect(enqueueDesign(outsider.id, { ...input(), projectId: job.projectId })).rejects.toThrow("无权访问");
    const ctx = { params: Promise.resolve({ id: job.id }) };
    expect((await detail(req(outsider), ctx)).status).toBe(404);
    expect((await download(req(outsider), ctx)).status).toBe(404);
    expect((await download(req(owner), ctx)).status).toBe(409);
    expect((await detail(new NextRequest("https://example.invalid/api/design"), ctx)).status).toBe(401);
    expect(await requireDb().select().from(projects).where(eq(projects.userId, outsider.id))).toHaveLength(0);
  });
  it("serializes worker claims, fences stale completions, and archives downloadable results", async () => {
    const a = await user(); const b = await user(); await enqueueDesign(a.id, input()); await enqueueDesign(b.id, input());
    const claims = await Promise.all([claimDesign(), claimDesign(), claimDesign()]);
    const claimed = claims.find(Boolean)!; expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await finishDesign(claimed.id, randomUUID(), { error: "stale" })).toBe(false);
    expect(await saveDesignDiagnostics(claimed.id, randomUUID(), claimed.diagnostics!)).toBe(false);
    expect(await finishDesign(claimed.id, claimed.leaseToken!, { result, model: "test", knowledgeVersion: "test-v1" })).toBe(true);
    expect(await finishDesign(claimed.id, claimed.leaseToken!, { error: "late" })).toBe(false);
    expect(await saveDesignDiagnostics(claimed.id, claimed.leaseToken!, claimed.diagnostics!)).toBe(false);
    const owner = claimed.userId === a.id ? a : b;
    const stored = await getDesign(owner.id, claimed.id); expect(stored?.result).toEqual(result);
    const response = await download(req(owner), { params: Promise.resolve({ id: claimed.id }) });
    expect(response.status).toBe(200); expect(await response.text()).toContain("持久化架构");
    expect(await claimDesign()).not.toBeNull();
  });
  it("expires interrupted worker/queue jobs, refuses late results, and retries in the same project", async () => {
    const owner = await user(); const first = await enqueueDesign(owner.id, input()); const claim = (await claimDesign())!;
    await requireDb().update(designJobs).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(designJobs.id, first.id));
    expect((await getDesign(owner.id, first.id))?.status).toBe("failed");
    expect((await getDesign(owner.id, first.id))?.diagnostics?.errorCode).toBe("LEASE_EXPIRED");
    expect(await finishDesign(first.id, claim.leaseToken!, { result, model: "late", knowledgeVersion: "late" })).toBe(false);
    const second = await enqueueDesign(owner.id, { ...input(), projectId: first.projectId });
    expect(second.projectId).toBe(first.projectId); expect(second.id).not.toBe(first.id);
    expect((await getDesign(owner.id, first.id))?.status).toBe("failed");
    await requireDb().update(designJobs).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(designJobs.id, second.id));
    expect(await claimDesign()).toBeNull();
    expect((await getDesign(owner.id, second.id))?.status).toBe("failed");
    expect(await requireDb().select().from(projects).where(eq(projects.userId, owner.id))).toHaveLength(1);
  });
  it("caps global backlog without orphan projects and paginates complete history", async () => {
    const people = await Promise.all(Array.from({ length: 21 }, user));
    await Promise.all(people.slice(0, 20).map(person => enqueueDesign(person.id, input())));
    await expect(enqueueDesign(people[20].id, input())).rejects.toThrow("队列已满");
    expect(await requireDb().select().from(projects).where(eq(projects.userId, people[20].id))).toHaveLength(0);
    await requireDb().update(designJobs).set({ status: "failed", error: "fixture" }).where(inArray(designJobs.userId, people.map(person => person.id)));
    const owner = people[20]; let projectId: string | undefined;
    for (let i = 0; i < 22; i++) {
      const job = await enqueueDesign(owner.id, { ...input(), projectId }); projectId = job.projectId;
      await requireDb().update(designJobs).set({ status: "failed" }).where(eq(designJobs.id, job.id));
    }
    const first = await listDesigns(owner.id, projectId); expect(first.jobs).toHaveLength(20); expect(first.nextOffset).toBe(20);
    expect((await listDesigns(owner.id, projectId, 20)).jobs).toHaveLength(2);
  });
  it("HTTP submission persists before 202, tolerates duplicate request, and never invokes a browser model stream", async () => {
    const owner = await user(); const request = input();
    const response = await POST(req(owner, request)); expect(response.status).toBe(202);
    const { job } = await response.json(); expect(job.status).toBe("queued");
    expect((await POST(req(owner, request))).status).toBe(202);
    expect((await getDesign(owner.id, job.id))?.requirement).toBe(request.requirement);
    const count = await requireDb().select({ total: sql<number>`count(*)::int` }).from(designJobs).where(and(eq(designJobs.userId, owner.id), eq(designJobs.requestId, request.requestId)));
    expect(count[0].total).toBe(1);
  });
  it("runs the real queue/worker/archive flow with a controlled model, retaining provider failures", async () => {
    const owner = await user(); const first = await enqueueDesign(owner.id, input());
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify(result));
    expect(await processNextDesign()).toBe(true);
    expect((await getDesign(owner.id, first.id))?.result).toMatchObject({ ...result, retrieval: { status: "no-match", references: [] } });
    const successful = await getDesign(owner.id, first.id);
    expect(successful?.diagnostics?.phases.map(p => p.phase)).toEqual(["queue", "config", "retrieval", "model", "validation", "saving"]);
    expect(successful?.diagnostics?.phases.every(p => p.durationMs !== undefined)).toBe(true);
    const admin = (await listDesignDiagnostics()).find(j => j.id === first.id)!;
    expect(Object.keys(admin).sort()).toEqual(["completedAt", "createdAt", "diagnostics", "id", "status"]);
    const next = await enqueueDesign(owner.id, { ...input(), projectId: first.projectId });
    vi.mocked(callLlm).mockRejectedValue(new LlmRequestError("模型服务额度不足"));
    await processNextDesign();
    expect(await getDesign(owner.id, next.id)).toMatchObject({ status: "failed", error: "模型服务额度不足", result: null });
    expect(await processNextDesign()).toBe(false);
    // Independent Node process has no access to this test's module state or pool.
    const durable = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import postgres from 'postgres';
      const db = postgres(process.env.DATABASE_URL);
      const rows = await db\`select status, result from design_jobs where id = \${process.argv[1]}\`;
      console.log(JSON.stringify(rows[0])); await db.end();
    `, first.id], { encoding: "utf8" });
    expect(JSON.parse(durable)).toMatchObject({ status: "completed", result });
  });
});
