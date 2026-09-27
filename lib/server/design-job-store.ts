import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { auditLogs, designJobs, projects } from "@/lib/db/schema";
import { DESIGN_LEASE_MS, DESIGN_QUEUE_LIMIT, DESIGN_QUEUE_MS, type DesignJob, type DesignJobInput } from "@/lib/agent/design-jobs";
import type { DesignResult } from "@/lib/agent/llm";
import { closePhase, expiredDiagnostics, queuedDiagnostics, type DesignDiagnostics } from "@/lib/agent/design-diagnostics";

type Tx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];
type Row = typeof designJobs.$inferSelect;
const active = ["queued", "running"] as const;
export const DESIGN_EXPIRED = "任务等待或执行超时，需求已保存，请重试；若反复失败请联系管理员检查后台服务和模型。";
export class DesignJobError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
function publicJob(row: Row, projectName: string): DesignJob {
  const expired = active.includes(row.status as typeof active[number]) && row.deadlineAt.getTime() <= Date.now();
  return {
    id: row.id, projectId: row.projectId, projectName, requirement: row.requirement,
    status: expired ? "failed" : row.status, model: row.model, knowledgeVersion: row.knowledgeVersion,
    result: row.result, error: expired ? DESIGN_EXPIRED : row.error,
    diagnostics: expired ? expiredDiagnostics(row.diagnostics, row.status, row.deadlineAt) : row.diagnostics,
    createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: (expired ? row.deadlineAt : row.completedAt)?.toISOString() ?? null, deadlineAt: row.deadlineAt.toISOString(),
  };
}
async function lockQueue(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vibehard:design-queue'))`);
  const expired = await tx.select().from(designJobs).where(and(inArray(designJobs.status, [...active]), sql`${designJobs.deadlineAt} <= now()`));
  for (const row of expired) await tx.update(designJobs).set({ status: "failed", error: DESIGN_EXPIRED,
    diagnostics: expiredDiagnostics(row.diagnostics, row.status, row.deadlineAt), leaseToken: null, completedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(designJobs.id, row.id));
}
export async function enqueueDesign(userId: string, input: DesignJobInput) {
  return requireDb().transaction(async tx => {
    await lockQueue(tx);
    const prior = (await tx.select().from(designJobs).where(and(eq(designJobs.userId, userId), eq(designJobs.requestId, input.requestId))).limit(1))[0];
    if (prior) {
      if (prior.requirement !== input.requirement || prior.requestedProjectId !== (input.projectId ?? null)) throw new DesignJobError("此提交编号已用于其他需求，请刷新后重新提交");
      const project = (await tx.select().from(projects).where(and(eq(projects.id, prior.projectId), eq(projects.userId, userId))).limit(1))[0];
      if (!project) throw new DesignJobError("项目不存在", 404);
      return publicJob(prior, project.name);
    }
    // Check ownership before capacity, without revealing another user's project.
    let project = input.projectId ? (await tx.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, userId))).limit(1))[0] : undefined;
    if (input.projectId && !project) throw new DesignJobError("项目不存在或无权访问", 404);
    const pending = await tx.select({ userId: designJobs.userId }).from(designJobs).where(inArray(designJobs.status, [...active])).limit(DESIGN_QUEUE_LIMIT);
    if (pending.some(job => job.userId === userId)) throw new DesignJobError("你已有一个方案正在排队或生成，请在方案记录中查看");
    if (pending.length >= DESIGN_QUEUE_LIMIT) throw new DesignJobError("方案队列已满，请稍后重试", 429);
    if (!project) {
      const id = randomUUID();
      [project] = await tx.insert(projects).values({ id, userId, name: `方案 · ${input.requirement.slice(0, 60)}`,
        workspaceKey: `${userId}/${id}-design`, runnerKey: process.env.DEFAULT_RUNNER_KEY ?? "cloud-runner" }).returning();
      await tx.insert(auditLogs).values({ userId, projectId: id, action: "project.created", metadata: { source: "design" } });
    }
    const [job] = await tx.insert(designJobs).values({ userId, projectId: project.id, requestId: input.requestId,
      requestedProjectId: input.projectId ?? null, requirement: input.requirement,
      diagnostics: queuedDiagnostics(new Date()),
      deadlineAt: sql`now() + ${DESIGN_QUEUE_MS} * interval '1 millisecond'` }).returning();
    await tx.update(projects).set({ updatedAt: sql`now()` }).where(eq(projects.id, project.id));
    await tx.insert(auditLogs).values({ userId, projectId: project.id, action: "design.queued", metadata: { jobId: job.id } });
    return publicJob(job, project.name);
  });
}
export async function listDesigns(userId: string, projectId?: string, offset = 0) {
  const rows = await requireDb().select({ job: designJobs, projectName: projects.name }).from(designJobs)
    .innerJoin(projects, eq(projects.id, designJobs.projectId))
    .where(and(eq(designJobs.userId, userId), eq(projects.userId, userId), projectId ? eq(designJobs.projectId, projectId) : undefined))
    .orderBy(desc(designJobs.createdAt), desc(designJobs.id)).limit(21).offset(offset);
  return { jobs: rows.slice(0, 20).map(({ job, projectName }) => {
    const { result: _result, ...summary } = publicJob(job, projectName); void _result; return summary;
  }), nextOffset: rows.length > 20 ? offset + 20 : null };
}
export async function getDesign(userId: string, id: string) {
  const row = (await requireDb().select({ job: designJobs, projectName: projects.name }).from(designJobs)
    .innerJoin(projects, eq(projects.id, designJobs.projectId))
    .where(and(eq(designJobs.id, id), eq(designJobs.userId, userId), eq(projects.userId, userId))).limit(1))[0];
  return row ? publicJob(row.job, row.projectName) : null;
}
export async function claimDesign() {
  return requireDb().transaction(async tx => {
    await lockQueue(tx);
    if ((await tx.select({ id: designJobs.id }).from(designJobs).where(eq(designJobs.status, "running")).limit(1)).length) return null;
    const next = (await tx.select().from(designJobs).where(eq(designJobs.status, "queued")).orderBy(asc(designJobs.createdAt), asc(designJobs.id)).limit(1))[0];
    if (!next) return null;
    return (await tx.update(designJobs).set({ status: "running", leaseToken: randomUUID(), startedAt: sql`now()`, updatedAt: sql`now()`,
      deadlineAt: sql`now() + ${DESIGN_LEASE_MS} * interval '1 millisecond'` }).where(eq(designJobs.id, next.id)).returning())[0];
  });
}
export async function saveDesignDiagnostics(id: string, leaseToken: string, diagnostics: DesignDiagnostics) {
  const rows = await requireDb().update(designJobs).set({ diagnostics, updatedAt: sql`now()` })
    .where(and(eq(designJobs.id, id), eq(designJobs.status, "running"), eq(designJobs.leaseToken, leaseToken), sql`${designJobs.deadlineAt} > clock_timestamp()`)).returning({ id: designJobs.id });
  return rows.length === 1;
}
export async function listDesignDiagnostics() {
  // Deliberately exclude requirement/result/user identity from the admin diagnostics API.
  return requireDb().select({ id: designJobs.id, status: designJobs.status, diagnostics: designJobs.diagnostics,
    createdAt: designJobs.createdAt, completedAt: designJobs.completedAt }).from(designJobs).orderBy(desc(designJobs.createdAt)).limit(50);
}
export async function finishDesign(id: string, leaseToken: string, outcome: ({ result: DesignResult; model: string; knowledgeVersion: string } | { error: string }) & { diagnostics?: DesignDiagnostics }, executionDeadline?: number) {
  return requireDb().transaction(async tx => {
    const now = new Date();
    if (outcome.diagnostics) {
      outcome.diagnostics = structuredClone(outcome.diagnostics); closePhase(outcome.diagnostics, now);
      const start = outcome.diagnostics.phases.find(p => p.phase !== "queue");
      if (start) outcome.diagnostics.totalMs = now.getTime() - Date.parse(start.startedAt);
    }
    if (executionDeadline && !("error" in outcome)) {
      const remaining = executionDeadline - Date.now();
      if (remaining <= 0) throw new Error("design deadline expired before save");
      await tx.execute(sql`select set_config('statement_timeout', ${String(Math.max(1, Math.floor(remaining)))}, true)`);
    }
    const [job] = await tx.update(designJobs).set({ ...outcome, status: "error" in outcome ? "failed" : "completed",
      leaseToken: null, completedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(designJobs.id, id), eq(designJobs.status, "running"), eq(designJobs.leaseToken, leaseToken), sql`${designJobs.deadlineAt} > clock_timestamp()`,
        executionDeadline && !("error" in outcome) ? sql`clock_timestamp() < ${new Date(executionDeadline).toISOString()}::timestamptz` : undefined)).returning();
    if (job) await tx.update(projects).set({ updatedAt: sql`now()` }).where(eq(projects.id, job.projectId));
    if (job && outcome.diagnostics) {
      const ended = new Date();
      const last = outcome.diagnostics.phases.at(-1);
      if (last) { last.endedAt = ended.toISOString(); last.durationMs = Math.max(0, ended.getTime() - Date.parse(last.startedAt)); }
      const start = outcome.diagnostics.phases.find(p => p.phase !== "queue");
      if (start) outcome.diagnostics.totalMs = ended.getTime() - Date.parse(start.startedAt);
      // Same transaction: if saving exhausts the execution budget, roll back the result.
      if (executionDeadline && !("error" in outcome) && Date.now() >= executionDeadline) throw new Error("design deadline expired during save");
      await tx.update(designJobs).set({ diagnostics: outcome.diagnostics }).where(eq(designJobs.id, id));
    }
    return Boolean(job);
  });
}
