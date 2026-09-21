import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { auditLogs, designJobs, projects } from "@/lib/db/schema";
import { DESIGN_LEASE_MS, DESIGN_QUEUE_LIMIT, DESIGN_QUEUE_MS, type DesignJob, type DesignJobInput } from "@/lib/agent/design-jobs";
import type { DesignResult } from "@/lib/agent/llm";

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
    createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: (expired ? row.deadlineAt : row.completedAt)?.toISOString() ?? null, deadlineAt: row.deadlineAt.toISOString(),
  };
}
async function lockQueue(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vibehard:design-queue'))`);
  await tx.update(designJobs).set({ status: "failed", error: DESIGN_EXPIRED, leaseToken: null, completedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(inArray(designJobs.status, [...active]), sql`${designJobs.deadlineAt} <= now()`));
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
export async function finishDesign(id: string, leaseToken: string, outcome: { result: DesignResult; model: string; knowledgeVersion: string } | { error: string }) {
  return requireDb().transaction(async tx => {
    const [job] = await tx.update(designJobs).set({ ...outcome, status: "error" in outcome ? "failed" : "completed",
      leaseToken: null, completedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(designJobs.id, id), eq(designJobs.status, "running"), eq(designJobs.leaseToken, leaseToken), sql`${designJobs.deadlineAt} > now()`)).returning();
    if (job) await tx.update(projects).set({ updatedAt: sql`now()` }).where(eq(projects.id, job.projectId));
    return Boolean(job);
  });
}
