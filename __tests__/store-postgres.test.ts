import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { envelope, type RunnerEvent } from "@/lib/agent/protocol";
import { requireDb } from "@/lib/db";
import { runnerCommands, runnerNodes } from "@/lib/db/schema";
import {
  authenticateRunner,
  createProject,
  createThread,
  createTurn,
  createUser,
  decideApproval,
  getThreadOverview,
  ingestRunnerEvent,
  interruptLatestTurn,
  listEvents,
  registerRunner,
} from "@/lib/server/store";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("PostgreSQL state transitions", () => {
  it("serializes approval decisions and resumes events from a sequence", async () => {
    const suffix = crypto.randomUUID();
    const user = await createUser({ email: `postgres-${suffix}@example.com`, passwordHash: "test", inviteCode: "TEST" });
    const project = await createProject(user.id, { name: "Postgres project", workspaceKey: `postgres-${suffix}` });
    const thread = await createThread(user.id, project.id, "Postgres thread");
    if (!thread) throw new Error("thread was not created");
    const turn = await createTurn(user.id, thread.id, "Run integration test", "gpt-5.6-sol", "tokenadvent");
    if (!turn) throw new Error("turn was not created");

    const runnerEvent = (type: RunnerEvent["event"]["type"], data: Record<string, unknown>): RunnerEvent => ({
      ...envelope(),
      type: "event",
      runnerKey: "local-runner",
      taskId: turn.id,
      threadId: thread.id,
      event: { eventId: crypto.randomUUID(), sequence: 0, timestamp: new Date().toISOString(), type, data },
    });

    await ingestRunnerEvent(runnerEvent("task.started", { model: "gpt-5.6-sol" }));
    const approvalId = crypto.randomUUID();
    await ingestRunnerEvent(runnerEvent("approval.requested", { approvalId, tool: "command", risk: "command", description: "Run tests", command: "pnpm test" }));

    const allEvents = await listEvents(user.id, thread.id, -1);
    expect(allEvents).not.toBeNull();
    expect(allEvents).toHaveLength(3);
    expect(allEvents![0]).toMatchObject({ type: 'knowledge.retrieved', payload: { origin: 'platform' } });
    const resumed = await listEvents(user.id, thread.id, allEvents![0].sequence);
    expect(resumed?.map((event) => event.eventId)).toEqual(allEvents!.slice(1).map(event => event.eventId));

    const decisions = await Promise.all([
      decideApproval(user.id, approvalId, "approve"),
      decideApproval(user.id, approvalId, "reject"),
    ]);
    expect(decisions.filter(Boolean)).toHaveLength(1);
    expect(await interruptLatestTurn(user.id, thread.id)).toBe(true);
    expect(await interruptLatestTurn(user.id, thread.id)).toBe(true);
    const interruptCommands = await requireDb().select({ id: runnerCommands.id }).from(runnerCommands).where(and(eq(runnerCommands.taskId, turn.id), eq(runnerCommands.type, "task.interrupt")));
    expect(interruptCommands).toHaveLength(1);

    await ingestRunnerEvent(runnerEvent("task.interrupted", {}));
    await ingestRunnerEvent(runnerEvent("task.failed", { message: "late failure" }));
    const overview = await getThreadOverview(user.id, thread.id);
    expect(overview?.approvals.find((approval) => approval.id === approvalId)?.status).toMatch(/approved|rejected/);
    expect(overview?.turns.find((candidate) => candidate.id === turn.id)?.status).toBe("interrupted");
  });

  it("rejects a revoked Runner secret", async () => {
    const runnerKey = `revoked-${crypto.randomUUID()}`;
    const credential = await registerRunner({ runnerKey, name: "Revoked Runner", capabilities: ["codex"] });
    expect(await authenticateRunner(runnerKey, credential.secret)).toBe(true);
    await requireDb().update(runnerNodes).set({ status: "revoked" }).where(eq(runnerNodes.runnerKey, runnerKey));
    expect(await authenticateRunner(runnerKey, credential.secret)).toBe(false);
  });
});
