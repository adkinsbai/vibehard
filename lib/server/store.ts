import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, lt, max, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentEvents,
  agentThreads,
  agentTurns,
  approvals,
  artifacts,
  auditLogs,
  modelProfiles,
  projects,
  projectKnowledge,
  runnerCommands,
  runnerNodes,
  users,
} from "@/lib/db/schema";
import { DEFAULT_MODELS } from "@/lib/agent/models";
import type { AgentEvent, ApprovalDecision, PlatformToRunnerMessage, RunnerEvent } from "@/lib/agent/protocol";
import { envelope } from "@/lib/agent/protocol";
import { hashRunnerSecret } from "./security";
import { publicLlm } from "./llm-settings";
import { getProjectKnowledge } from "./knowledge-store";
import { publishedSnapshot } from "./knowledge-state";
import { prepareKnowledge } from "./knowledge-dispatch";
import { retrieveAuthorizedKnowledge } from "./knowledge-retrieval-service";
import { prepareRetrieval } from "./retrieval-dispatch";
import { knowledgeManifest } from "@/lib/agent/knowledge";

type UserRecord = typeof users.$inferSelect;
type ProjectRecord = typeof projects.$inferSelect;
type ThreadRecord = typeof agentThreads.$inferSelect;
type TurnRecord = typeof agentTurns.$inferSelect;
type ApprovalRecord = typeof approvals.$inferSelect;

interface MemoryState {
  users: UserRecord[];
  projects: ProjectRecord[];
  threads: ThreadRecord[];
  turns: TurnRecord[];
  events: (typeof agentEvents.$inferSelect)[];
  approvals: ApprovalRecord[];
  artifacts: (typeof artifacts.$inferSelect)[];
  runners: (typeof runnerNodes.$inferSelect)[];
}

declare global {
  var __vibehardMemoryStore: MemoryState | undefined;
}

const memory = globalThis.__vibehardMemoryStore ?? {
  users: [], projects: [], threads: [], turns: [], events: [], approvals: [], artifacts: [], runners: [],
};
globalThis.__vibehardMemoryStore = memory;

const now = () => new Date();
const timestampFields = () => ({ createdAt: now(), updatedAt: now() });
const ACTIVE_TURN_STATUSES = ["queued", "running", "waiting_approval"] as const;

export class ThreadBusyError extends Error {
  constructor() { super("当前会话已有任务正在运行，请等待完成或先中断"); }
}

export class RunnerUnavailableError extends Error {
  constructor() { super("选择的执行器不存在或当前离线"); }
}

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!db) return memory.users.find((user) => user.email === normalized) ?? null;
  return (await db.select().from(users).where(eq(users.email, normalized)).limit(1))[0] ?? null;
}

export async function findUserById(id: string) {
  if (!db) return memory.users.find((user) => user.id === id) ?? null;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
}

export async function resetUserPassword(targetUserId: string, passwordHash: string) {
  if (!db) {
    const user = memory.users.find((item) => item.id === targetUserId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.updatedAt = now();
    return user;
  }
  return (await db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, targetUserId)).returning())[0] ?? null;
}

export async function createUser(input: { email: string; passwordHash: string; inviteCode: string; name?: string }) {
  const record = { id: randomUUID(), email: input.email.trim().toLowerCase(), passwordHash: input.passwordHash, name: input.name ?? "VibeHard 用户", role: "member", inviteCode: input.inviteCode, ...timestampFields() };
  if (!db) { memory.users.push(record); return record; }
  return (await db.insert(users).values(record).returning())[0];
}

export async function listProjects(userId: string) {
  if (!db) return memory.projects.filter((project) => project.userId === userId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function createProject(userId: string, input: { name: string; workspaceKey: string; model?: string; runnerKey?: string }) {
  if (input.runnerKey) {
    const available = !db
      ? memory.runners.some((runner) => runner.runnerKey === input.runnerKey && ["online", "busy"].includes(runner.status))
      : Boolean((await db.select({ id: runnerNodes.id }).from(runnerNodes).where(and(eq(runnerNodes.runnerKey, input.runnerKey), inArray(runnerNodes.status, ["online", "busy"]))).limit(1))[0]);
    if (!available) throw new RunnerUnavailableError();
  }
  const projectId = randomUUID();
  const workspaceKey = `${userId}/${projectId}-${input.workspaceKey}`;
  const record = { id: projectId, userId, name: input.name, workspaceKey, runnerKey: input.runnerKey ?? process.env.DEFAULT_RUNNER_KEY ?? "local-runner", defaultModel: input.model ?? (await listModels())[0].model, ...timestampFields() };
  if (!db) { memory.projects.push(record); return record; }
  const project = (await db.insert(projects).values(record).returning())[0];
  await db.insert(auditLogs).values({ userId, projectId: project.id, action: "project.created", metadata: { workspaceKey: project.workspaceKey } });
  return project;
}

export async function listAvailableRunners() {
  const visible = (runner: typeof runnerNodes.$inferSelect) => ({ runnerKey: runner.runnerKey, name: runner.name, status: runner.status, capabilities: runner.capabilities, lastHeartbeatAt: runner.lastHeartbeatAt });
  if (!db) return memory.runners.filter((runner) => ["online", "busy"].includes(runner.status)).map(visible);
  return (await db.select().from(runnerNodes).where(inArray(runnerNodes.status, ["online", "busy"])).orderBy(asc(runnerNodes.name))).map(visible);
}

export async function ownedProject(userId: string, projectId: string) {
  if (!db) return memory.projects.find((project) => project.id === projectId && project.userId === userId) ?? null;
  return (await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1))[0] ?? null;
}

export async function listThreads(userId: string, projectId: string) {
  if (!(await ownedProject(userId, projectId))) return null;
  if (!db) return memory.threads.filter((thread) => thread.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return db.select().from(agentThreads).where(eq(agentThreads.projectId, projectId)).orderBy(desc(agentThreads.updatedAt));
}

export async function createThread(userId: string, projectId: string, title?: string) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  const record = { id: randomUUID(), projectId, runnerId: null, codexThreadId: null, title: title?.trim() || "新建 Agent 会话", ...timestampFields() };
  if (!db) { memory.threads.push(record); return record; }
  return (await db.insert(agentThreads).values(record).returning())[0];
}

async function ownedThread(userId: string, threadId: string) {
  if (!db) {
    const thread = memory.threads.find((item) => item.id === threadId);
    if (!thread || !(await ownedProject(userId, thread.projectId))) return null;
    return { thread, project: (await ownedProject(userId, thread.projectId))! };
  }
  return (await db.select({ thread: agentThreads, project: projects }).from(agentThreads).innerJoin(projects, eq(projects.id, agentThreads.projectId)).where(and(eq(agentThreads.id, threadId), eq(projects.userId, userId))).limit(1))[0] ?? null;
}

export async function getThreadOverview(userId: string, threadId: string) {
  const owned = await ownedThread(userId, threadId);
  if (!owned) return null;
  if (!db) return {
    ...owned,
    turns: memory.turns.filter((turn) => turn.threadId === threadId),
    events: memory.events.filter((event) => memory.turns.some((turn) => turn.id === event.turnId && turn.threadId === threadId)).sort((a, b) => a.sequence - b.sequence),
    approvals: memory.approvals.filter((approval) => memory.turns.some((turn) => turn.id === approval.turnId && turn.threadId === threadId)),
    artifacts: memory.artifacts.filter((artifact) => artifact.projectId === owned.project.id),
  };
  const turns = await db.select().from(agentTurns).where(eq(agentTurns.threadId, threadId)).orderBy(asc(agentTurns.createdAt));
  const turnIds = turns.map((turn) => turn.id);
  const events = turnIds.length ? await db.select().from(agentEvents).where(inArray(agentEvents.turnId, turnIds)).orderBy(asc(agentEvents.createdAt), asc(agentEvents.sequence)) : [];
  const pendingApprovals = turnIds.length ? await db.select().from(approvals).where(inArray(approvals.turnId, turnIds)).orderBy(desc(approvals.createdAt)) : [];
  const threadArtifacts = await db.select().from(artifacts).where(eq(artifacts.projectId, owned.project.id)).orderBy(desc(artifacts.createdAt));
  return { ...owned, turns, events, approvals: pendingApprovals, artifacts: threadArtifacts };
}

export async function createTurn(userId: string, threadId: string, input: string, model: string, providerId?: string) {
  const owned = await ownedThread(userId, threadId);
  if (!owned) return null;
  const record: TurnRecord = { id: randomUUID(), threadId, userId, input, model, status: "queued", error: null, startedAt: null, completedAt: null, ...timestampFields() };
  const startMessage: PlatformToRunnerMessage = {
    ...envelope(), type: "task.start", taskId: record.id, projectId: owned.project.id, threadId,
    codexThreadId: owned.thread.codexThreadId ?? undefined, workspaceKey: owned.project.workspaceKey,
    input, model, modelProvider: providerId,
  };
  if (!db) {
    const documents = await getProjectKnowledge(userId, owned.project.id) ?? [];
    if (memory.turns.some((turn) => turn.threadId === threadId && ACTIVE_TURN_STATUSES.includes(turn.status as typeof ACTIVE_TURN_STATUSES[number]))) throw new ThreadBusyError();
    const turnIds = new Set(memory.turns.filter(turn => turn.threadId === threadId).map(turn => turn.id));
    const previous = memory.events.filter(event => turnIds.has(event.turnId) && event.type === "task.started").at(-1)?.payload.knowledge;
    const knowledge = prepareKnowledge(publishedSnapshot(documents), owned.thread.codexThreadId, previous, memory.runners.find(runner => runner.runnerKey === owned.project.runnerKey));
    memory.turns.push(record);
    memory.events.push({ id: randomUUID(), turnId: record.id, eventId: randomUUID(), type: "task.queued", payload: { input, knowledge: knowledgeManifest(knowledge), note: "未配置 DATABASE_URL，任务仅保存在本地预览中" }, sequence: 0, ...timestampFields() });
    return record;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge:${owned.project.id}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${threadId}))`);
    const active = (await tx.select({ id: agentTurns.id }).from(agentTurns).where(and(eq(agentTurns.threadId, threadId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES]))).limit(1))[0];
    if (active) throw new ThreadBusyError();
    const thread = (await tx.select().from(agentThreads).where(eq(agentThreads.id, threadId)).limit(1))[0];
    const documents = (await tx.select().from(projectKnowledge).where(eq(projectKnowledge.projectId, owned.project.id)).limit(1))[0]?.documents ?? [];
    const previous = (await tx.select({ payload: agentEvents.payload }).from(agentEvents).innerJoin(agentTurns, eq(agentTurns.id, agentEvents.turnId))
      .where(and(eq(agentTurns.threadId, threadId), eq(agentEvents.type, "task.started"))).orderBy(desc(agentEvents.sequence)).limit(1))[0]?.payload.knowledge;
    const runner = (await tx.select().from(runnerNodes).where(eq(runnerNodes.runnerKey, owned.project.runnerKey ?? process.env.DEFAULT_RUNNER_KEY ?? "local-runner")).limit(1))[0];
    startMessage.knowledge = prepareKnowledge(publishedSnapshot(documents), thread.codexThreadId, previous, runner);
    const previousRetrieval = (await tx.select({ payload: agentEvents.payload }).from(agentEvents).innerJoin(agentTurns, eq(agentTurns.id, agentEvents.turnId))
      .where(and(eq(agentTurns.threadId, threadId), eq(agentEvents.type, "knowledge.retrieved"))).orderBy(desc(agentEvents.sequence)).limit(1))[0]?.payload.retrieval;
    const retrieved = await retrieveAuthorizedKnowledge({ userId, projectId: owned.project.id, query: input, purpose: "agent" }, tx);
    const dispatch = prepareRetrieval(retrieved, thread.codexThreadId, previousRetrieval, runner);
    startMessage.retrieval = dispatch.payload;
    startMessage.codexThreadId = startMessage.knowledge.contextReset || dispatch.contextReset ? undefined : thread.codexThreadId ?? undefined;
    await tx.insert(agentTurns).values(record);
    const turnIds = (await tx.select({ id: agentTurns.id }).from(agentTurns).where(eq(agentTurns.threadId, threadId))).map(t => t.id);
    const sequence = (await tx.select({ value: max(agentEvents.sequence) }).from(agentEvents).where(inArray(agentEvents.turnId, turnIds)))[0]?.value ?? -1;
    await tx.insert(agentEvents).values({ turnId: record.id, eventId: randomUUID(), type: "knowledge.retrieved", sequence: sequence + 1,
      payload: { retrieval: dispatch.evidence, contextReset: dispatch.contextReset, origin: "platform" } });
    await tx.insert(runnerCommands).values({ taskId: record.id, runnerKey: owned.project.runnerKey ?? process.env.DEFAULT_RUNNER_KEY ?? "local-runner", type: startMessage.type, payload: startMessage as unknown as Record<string, unknown> });
    await tx.insert(auditLogs).values({ userId, projectId: owned.project.id, action: "turn.queued", metadata: { turnId: record.id, model } });
  });
  return record;
}

export async function interruptLatestTurn(userId: string, threadId: string) {
  const owned = await ownedThread(userId, threadId);
  if (!owned) return null;
  if (!db) {
    const turn = [...memory.turns].reverse().find((item) => item.threadId === threadId && ACTIVE_TURN_STATUSES.includes(item.status as typeof ACTIVE_TURN_STATUSES[number]));
    if (!turn) return false;
    turn.status = "interrupted"; turn.completedAt = now(); turn.updatedAt = now();
    return true;
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${threadId}))`);
    const turn = (await tx.select().from(agentTurns).where(and(eq(agentTurns.threadId, threadId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES]))).orderBy(desc(agentTurns.createdAt)).limit(1))[0];
    if (!turn) return false;
    const existing = (await tx.select({ id: runnerCommands.id }).from(runnerCommands).where(and(eq(runnerCommands.taskId, turn.id), eq(runnerCommands.type, "task.interrupt"), inArray(runnerCommands.status, ["queued", "sent"]))).limit(1))[0];
    if (existing) return true;
    const message: PlatformToRunnerMessage = { ...envelope(), type: "task.interrupt", taskId: turn.id, threadId };
    await tx.insert(runnerCommands).values({ taskId: turn.id, runnerKey: owned.project.runnerKey ?? "local-runner", type: message.type, payload: message as unknown as Record<string, unknown> });
    return true;
  });
}

export async function listEvents(userId: string, threadId: string, afterSequence = -1) {
  const owned = await ownedThread(userId, threadId);
  if (!owned) return null;
  if (!db) return memory.events.filter((event) => memory.turns.some((turn) => turn.id === event.turnId && turn.threadId === threadId) && event.sequence > afterSequence).sort((a, b) => a.sequence - b.sequence);
  const turnIds = (await db.select({ id: agentTurns.id }).from(agentTurns).where(eq(agentTurns.threadId, threadId))).map((turn) => turn.id);
  if (!turnIds.length) return [];
  return db.select().from(agentEvents).where(and(inArray(agentEvents.turnId, turnIds), gt(agentEvents.sequence, afterSequence))).orderBy(asc(agentEvents.createdAt), asc(agentEvents.sequence));
}

export async function decideApproval(userId: string, approvalId: string, decision: ApprovalDecision) {
  if (!db) {
    const approval = memory.approvals.find((item) => item.id === approvalId && item.status === "pending");
    const turn = approval ? memory.turns.find((item) => item.id === approval.turnId) : null;
    const thread = turn ? memory.threads.find((item) => item.id === turn.threadId) : null;
    const project = thread ? memory.projects.find((item) => item.id === thread.projectId && item.userId === userId) : null;
    if (!approval || !turn || !project) return null;
    approval.status = decision === "approve" ? "approved" : "rejected"; approval.decisionBy = userId; approval.decidedAt = now(); approval.updatedAt = now();
    return approval;
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${approvalId}))`);
    const owned = (await tx.select({ approval: approvals, turn: agentTurns, thread: agentThreads, project: projects }).from(approvals).innerJoin(agentTurns, eq(agentTurns.id, approvals.turnId)).innerJoin(agentThreads, eq(agentThreads.id, agentTurns.threadId)).innerJoin(projects, eq(projects.id, agentThreads.projectId)).where(and(eq(approvals.id, approvalId), eq(projects.userId, userId), eq(approvals.status, "pending"))).limit(1))[0];
    if (!owned) return null;
    const updated = await tx.update(approvals).set({ status: decision === "approve" ? "approved" : "rejected", decisionBy: userId, decidedAt: now(), updatedAt: now() }).where(and(eq(approvals.id, approvalId), eq(approvals.status, "pending"))).returning();
    if (!updated[0]) return null;
    const message: PlatformToRunnerMessage = { ...envelope(), type: "approval.resolve", taskId: owned.turn.id, threadId: owned.thread.id, approvalId, decision };
    await tx.update(agentTurns).set({ status: "running", updatedAt: now() }).where(and(eq(agentTurns.id, owned.turn.id), eq(agentTurns.status, "waiting_approval")));
    await tx.insert(runnerCommands).values({ taskId: owned.turn.id, runnerKey: owned.project.runnerKey ?? "local-runner", type: message.type, payload: message as unknown as Record<string, unknown> });
    await tx.insert(auditLogs).values({ userId, projectId: owned.project.id, action: `approval.${decision}`, metadata: { approvalId, turnId: owned.turn.id } });
    return updated[0];
  });
}

export async function listModels() {
  const managed = await publicLlm("agent");
  if (managed.hasApiKey) return [{ id: `vibehard:${managed.model}`, providerId: "vibehard", model: managed.model, displayName: managed.model, kind: "custom" as const, capabilities: ["tools", "reasoning"] }];
  if (!db) return DEFAULT_MODELS;
  const configured = await db.select().from(modelProfiles).where(eq(modelProfiles.enabled, true));
  return configured.length ? configured.map((item) => ({ id: `${item.providerId}:${item.model}`, providerId: item.providerId, model: item.model, displayName: item.displayName, kind: item.providerId === "openai" ? "codex" as const : "custom" as const, capabilities: item.capabilities })) : DEFAULT_MODELS;
}

export async function getAdminOverview() {
  const visibleModels = (await listModels()).map((model) => ({ ...model, enabled: true }));
  if (!db) {
    const activeTurns = memory.turns.filter((turn) => ACTIVE_TURN_STATUSES.includes(turn.status as typeof ACTIVE_TURN_STATUSES[number])).length;
    return {
      counts: { users: memory.users.length, projects: memory.projects.length, threads: memory.threads.length, turns: memory.turns.length, activeTurns, pendingApprovals: memory.approvals.filter((item) => item.status === "pending").length },
      runners: memory.runners.map((runner) => ({ id: runner.id, runnerKey: runner.runnerKey, name: runner.name, status: runner.status, capabilities: runner.capabilities, instanceId: runner.instanceId, lastHeartbeatAt: runner.lastHeartbeatAt, createdAt: runner.createdAt, updatedAt: runner.updatedAt })).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      models: visibleModels,
      projects: memory.projects.map((project) => ({ ...project, userEmail: memory.users.find((user) => user.id === project.userId)?.email ?? "未知用户" })).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 20),
      auditLogs: [],
      users: memory.users.map((user) => ({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    };
  }

  const [userCount, projectCount, threadCount, turnCount, activeTurnCount, pendingApprovalCount, runners, configuredModels, recentProjects, recentAuditLogs, userList] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(projects),
    db.select({ value: count() }).from(agentThreads),
    db.select({ value: count() }).from(agentTurns),
    db.select({ value: count() }).from(agentTurns).where(inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])),
    db.select({ value: count() }).from(approvals).where(eq(approvals.status, "pending")),
    db.select({ id: runnerNodes.id, runnerKey: runnerNodes.runnerKey, name: runnerNodes.name, status: runnerNodes.status, capabilities: runnerNodes.capabilities, instanceId: runnerNodes.instanceId, lastHeartbeatAt: runnerNodes.lastHeartbeatAt, createdAt: runnerNodes.createdAt, updatedAt: runnerNodes.updatedAt }).from(runnerNodes).orderBy(desc(runnerNodes.updatedAt)),
    db.select({ id: modelProfiles.id, providerId: modelProfiles.providerId, model: modelProfiles.model, displayName: modelProfiles.displayName, capabilities: modelProfiles.capabilities, enabled: modelProfiles.enabled, updatedAt: modelProfiles.updatedAt }).from(modelProfiles).orderBy(desc(modelProfiles.updatedAt)),
    db.select({ id: projects.id, name: projects.name, workspaceKey: projects.workspaceKey, runnerKey: projects.runnerKey, defaultModel: projects.defaultModel, updatedAt: projects.updatedAt, userEmail: users.email }).from(projects).innerJoin(users, eq(users.id, projects.userId)).orderBy(desc(projects.updatedAt)).limit(20),
    db.select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, userEmail: users.email }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).orderBy(desc(auditLogs.createdAt)).limit(30),
    db.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)),
  ]);
  return {
    counts: { users: userCount[0]?.value ?? 0, projects: projectCount[0]?.value ?? 0, threads: threadCount[0]?.value ?? 0, turns: turnCount[0]?.value ?? 0, activeTurns: activeTurnCount[0]?.value ?? 0, pendingApprovals: pendingApprovalCount[0]?.value ?? 0 },
    runners, models: visibleModels.length ? visibleModels : configuredModels, projects: recentProjects, auditLogs: recentAuditLogs, users: userList,
  };
}

export async function resolveModelProfile(model: string, providerId?: string) {
  const matches = (await listModels()).filter((item) => item.model === model && (!providerId || item.providerId === providerId));
  return matches.length === 1 ? matches[0] : null;
}

export async function registerRunner(input: { runnerKey: string; name: string; capabilities: string[] }) {
  const secret = randomBytes(32).toString("base64url");
  const secretHash = hashRunnerSecret(secret);
  if (!db) {
    const existing = memory.runners.find((runner) => runner.runnerKey === input.runnerKey);
    if (existing) Object.assign(existing, { name: input.name, capabilities: input.capabilities, secretHash, status: "online", lastHeartbeatAt: now(), updatedAt: now() });
    else memory.runners.push({ id: randomUUID(), runnerKey: input.runnerKey, name: input.name, capabilities: input.capabilities, instanceId: null, secretHash, status: "online", lastHeartbeatAt: now(), ...timestampFields() });
    return { runnerKey: input.runnerKey, secret };
  }
  await db.insert(runnerNodes).values({ runnerKey: input.runnerKey, name: input.name, capabilities: input.capabilities, secretHash, status: "online", lastHeartbeatAt: now() }).onConflictDoUpdate({ target: runnerNodes.runnerKey, set: { name: input.name, capabilities: input.capabilities, secretHash, status: "online", lastHeartbeatAt: now(), updatedAt: now() } });
  return { runnerKey: input.runnerKey, secret };
}

export async function authenticateRunner(runnerKey: string, secret: string) {
  const hash = hashRunnerSecret(secret);
  if (!db) return memory.runners.some((runner) => runner.runnerKey === runnerKey && runner.secretHash === hash && runner.status !== "revoked");
  return Boolean((await db.select({ id: runnerNodes.id }).from(runnerNodes).where(and(eq(runnerNodes.runnerKey, runnerKey), eq(runnerNodes.secretHash, hash), ne(runnerNodes.status, "revoked"))).limit(1))[0]);
}

export async function runnerOwnsActiveTask(runnerKey: string, taskId: string) {
  if (!db) return false;
  return Boolean((await db.select({ id: runnerCommands.id }).from(runnerCommands)
    .innerJoin(agentTurns, eq(agentTurns.id, runnerCommands.taskId))
    .where(and(eq(runnerCommands.runnerKey, runnerKey), eq(runnerCommands.taskId, taskId), eq(runnerCommands.type, "task.start"), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])))
    .limit(1))[0]);
}

export async function heartbeatRunner(runnerKey: string, secret: string, capabilities?: string[], instanceId?: string) {
  if (!(await authenticateRunner(runnerKey, secret))) return false;
  if (!db) { const runner = memory.runners.find((item) => item.runnerKey === runnerKey)!; runner.lastHeartbeatAt = now(); runner.status = "online"; if (capabilities) runner.capabilities = capabilities; if (instanceId) runner.instanceId = instanceId; return true; }
  await db.update(runnerNodes).set({ status: "online", lastHeartbeatAt: now(), updatedAt: now(), ...(capabilities ? { capabilities } : {}), ...(instanceId ? { instanceId } : {}) }).where(and(eq(runnerNodes.runnerKey, runnerKey), ne(runnerNodes.status, "revoked")));
  return true;
}

export async function markRunnerOffline(runnerKey: string) {
  if (!db) { const runner = memory.runners.find((item) => item.runnerKey === runnerKey); if (runner && runner.status !== "revoked") runner.status = "offline"; return; }
  await db.update(runnerNodes).set({ status: "offline", updatedAt: now() }).where(and(eq(runnerNodes.runnerKey, runnerKey), ne(runnerNodes.status, "revoked")));
}

export async function markStaleRunnersOffline() {
  const staleBefore = new Date(Date.now() - 45_000);
  if (!db) { for (const runner of memory.runners) if (runner.status !== "revoked" && runner.status !== "offline" && (!runner.lastHeartbeatAt || runner.lastHeartbeatAt < staleBefore)) runner.status = "offline"; return; }
  await db.update(runnerNodes).set({ status: "offline", updatedAt: now() }).where(and(ne(runnerNodes.status, "revoked"), ne(runnerNodes.status, "offline"), lt(runnerNodes.lastHeartbeatAt, staleBefore)));
}

export async function getQueuedRunnerCommands(runnerKey: string) {
  if (!db) return [];
  return db.select().from(runnerCommands).where(and(eq(runnerCommands.runnerKey, runnerKey), eq(runnerCommands.status, "queued"))).orderBy(asc(runnerCommands.createdAt)).limit(20);
}

export async function markRunnerCommand(id: string, status: "sent" | "failed", runnerKey: string) {
  if (!db) return;
  await db.update(runnerCommands).set({ status: status === "failed" ? "queued" : "sent", attempts: sql`${runnerCommands.attempts} + 1`, updatedAt: now() }).where(and(eq(runnerCommands.id, id), eq(runnerCommands.runnerKey, runnerKey)));
}

export async function ingestRunnerEvent(message: RunnerEvent) {
  if (!db) return;
  const event = message.event;
  // Only createTurn records evidence. A Runner/model cannot forge the source event.
  if ((event.type as string) === "knowledge.retrieved") return;
  await db.transaction(async (tx) => {
    const currentTurn = (await tx.select({ threadId: agentTurns.threadId, projectId: agentThreads.projectId, runnerKey: projects.runnerKey })
      .from(agentTurns)
      .innerJoin(agentThreads, eq(agentThreads.id, agentTurns.threadId))
      .innerJoin(projects, eq(projects.id, agentThreads.projectId))
      .where(eq(agentTurns.id, message.taskId))
      .limit(1))[0];
    if (!currentTurn || currentTurn.runnerKey !== message.runnerKey || (message.threadId && message.threadId !== currentTurn.threadId)) return;

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${currentTurn.threadId}))`);
    if ((await tx.select({ id: agentEvents.id }).from(agentEvents).where(eq(agentEvents.eventId, event.eventId)).limit(1))[0]) return;
    const threadTurnIds = (await tx.select({ id: agentTurns.id }).from(agentTurns).where(eq(agentTurns.threadId, currentTurn.threadId))).map((turn) => turn.id);
    const currentSequence = (await tx.select({ value: max(agentEvents.sequence) }).from(agentEvents).where(inArray(agentEvents.turnId, threadTurnIds)))[0]?.value ?? -1;
    await tx.insert(agentEvents).values({ turnId: message.taskId, eventId: event.eventId, type: event.type, payload: event.data, sequence: currentSequence + 1 });
    if (message.codexThreadId) await tx.update(agentThreads).set({ codexThreadId: message.codexThreadId, updatedAt: now() }).where(eq(agentThreads.id, currentTurn.threadId));
    if (event.type === "task.started") await tx.update(agentTurns).set({ status: "running", startedAt: now(), updatedAt: now() }).where(and(eq(agentTurns.id, message.taskId), eq(agentTurns.status, "queued")));
    if (event.type === "task.completed") await tx.update(agentTurns).set({ status: "completed", completedAt: now(), updatedAt: now() }).where(and(eq(agentTurns.id, message.taskId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])));
    if (event.type === "task.interrupted") await tx.update(agentTurns).set({ status: "interrupted", completedAt: now(), updatedAt: now() }).where(and(eq(agentTurns.id, message.taskId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])));
    if (event.type === "task.failed") await tx.update(agentTurns).set({ status: "failed", error: String(event.data.message ?? "Runner task failed"), completedAt: now(), updatedAt: now() }).where(and(eq(agentTurns.id, message.taskId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])));
    if (event.type === "approval.requested") {
      const approvalId = typeof event.data.approvalId === "string" ? event.data.approvalId : randomUUID();
      const waiting = await tx.update(agentTurns).set({ status: "waiting_approval", updatedAt: now() }).where(and(eq(agentTurns.id, message.taskId), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES]))).returning({ id: agentTurns.id });
      if (waiting[0]) await tx.insert(approvals).values({ id: approvalId, turnId: message.taskId, tool: String(event.data.tool ?? "unknown"), risk: String(event.data.risk ?? "write"), description: String(event.data.description ?? "Agent 请求执行受限操作"), details: event.data }).onConflictDoNothing();
    }
    if (event.type === "artifact.created") await tx.insert(artifacts).values({ projectId: currentTurn.projectId, turnId: message.taskId, name: String(event.data.name ?? "Agent artifact"), kind: String(event.data.kind ?? "file"), path: String(event.data.path ?? "") });
    if (["task.started", "task.completed", "task.failed", "task.interrupted"].includes(event.type)) {
      const activeRunnerTurn = (await tx.select({ id: agentTurns.id }).from(agentTurns)
        .innerJoin(agentThreads, eq(agentThreads.id, agentTurns.threadId))
        .innerJoin(projects, eq(projects.id, agentThreads.projectId))
        .where(and(eq(projects.runnerKey, message.runnerKey), inArray(agentTurns.status, [...ACTIVE_TURN_STATUSES])))
        .limit(1))[0];
      await tx.update(runnerNodes).set({ status: activeRunnerTurn ? "busy" : "online", updatedAt: now() }).where(and(eq(runnerNodes.runnerKey, message.runnerKey), ne(runnerNodes.status, "revoked")));
    }
  });
}

export async function writeAuditLog(input: { userId?: string; projectId?: string; action: string; metadata?: Record<string, unknown> }) {
  if (!db) return;
  await db.insert(auditLogs).values({ userId: input.userId, projectId: input.projectId, action: input.action, metadata: input.metadata ?? {} });
}

export function serializeEvent(event: typeof agentEvents.$inferSelect): AgentEvent {
  return { eventId: event.eventId, sequence: event.sequence, timestamp: event.createdAt.toISOString(), type: event.type as AgentEvent["type"], data: event.payload };
}
