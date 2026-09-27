import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { requireDb } from "@/lib/db";
import { runnerCommands, users } from "@/lib/db/schema";
import { createProject, createThread, createTurn, createUser, ingestRunnerEvent, registerRunner } from "@/lib/server/store";
import { getProjectKnowledge, updateProjectKnowledge } from "@/lib/server/knowledge-store";
import { knowledgeManifest, type KnowledgeDraft } from "@/lib/agent/knowledge";
import { envelope, type TaskStart } from "@/lib/agent/protocol";

// Only run against an explicitly supplied disposable, migrated PostgreSQL database.
(process.env.DATABASE_URL ? describe : describe.skip)("PostgreSQL knowledge isolation and task snapshots", () => {
  it("serializes reviewer races, persists snapshots, and resets native context after publication/disable", async () => {
    const id = crypto.randomUUID();
    const user = await createUser({ email: `knowledge-${id}@example.com`, passwordHash: "test", inviteCode: "test" });
    const outsider = await createUser({ email: `knowledge-other-${id}@example.com`, passwordHash: "test", inviteCode: "test" });
    const runnerKey = `knowledge-${id}`;
    await registerRunner({ runnerKey, name: "Test only", capabilities: ["project-knowledge-v1"] });
    const project = await createProject(user.id, { name: "Knowledge DB test", workspaceKey: id, runnerKey });
    const draft: KnowledgeDraft = { title: "Pins", source: "p1", kind: "schematic", content: "reviewed v1" };
    const docs = (await updateProjectKnowledge(user.id, project.id, { action: "create", draft }))!;
    expect(await getProjectKnowledge(outsider.id, project.id)).toBeNull();
    expect(await updateProjectKnowledge(outsider.id, project.id, { action: "create", draft })).toBeNull();
    const action = { action: "publish" as const, documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true as const };
    await expect(updateProjectKnowledge(user.id, project.id, action)).rejects.toThrow("仅管理员");
    const reviewer = await createUser({ email: `knowledge-reviewer-${id}@example.com`, passwordHash: "test", inviteCode: "test" });
    await requireDb().update(users).set({ role: "developer" }).where(eq(users.id, reviewer.id));
    const results = await Promise.allSettled([updateProjectKnowledge(reviewer.id, project.id, action), updateProjectKnowledge(reviewer.id, project.id, action)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const thread = (await createThread(user.id, project.id))!;
    async function queuedTask() {
      const turn = (await createTurn(user.id, thread.id, "read pins", "fake"))!;
      const [command] = await requireDb().select().from(runnerCommands).where(eq(runnerCommands.taskId, turn.id));
      return command.payload as unknown as TaskStart;
    }
    async function complete(task: TaskStart) {
      for (const type of ["task.started", "task.completed"] as const) await ingestRunnerEvent({ ...envelope(), type: "event", runnerKey, taskId: task.taskId, threadId: thread.id, codexThreadId: "native-test", event: { eventId: crypto.randomUUID(), sequence: 0, timestamp: new Date().toISOString(), type, data: { knowledge: knowledgeManifest(task.knowledge!) } } });
    }
    const first = await queuedTask();
    expect(first.knowledge?.documents[0].content).toBe("reviewed v1");
    let current = (await getProjectKnowledge(user.id, project.id))![0];
    await updateProjectKnowledge(user.id, project.id, { action: "edit", documentId: current.id, expectedRevision: current.revision, draft: { ...draft, content: "reviewed v2" } });
    await complete(first);
    const second = await queuedTask();
    expect(second.codexThreadId).toBe("native-test");
    expect(second.knowledge?.documents[0].content).toBe("reviewed v1");
    current = (await getProjectKnowledge(user.id, project.id))![0];
    await updateProjectKnowledge(reviewer.id, project.id, { action: "publish", documentId: current.id, expectedRevision: current.revision, confirmed: true });
    expect(second.knowledge?.documents[0].content).toBe("reviewed v1");
    await complete(second);
    const third = await queuedTask();
    expect(third.codexThreadId).toBeUndefined();
    expect(third.knowledge).toMatchObject({ contextReset: true, documents: [{ content: "reviewed v2", version: 2 }] });
    await complete(third);
    current = (await getProjectKnowledge(user.id, project.id))![0];
    await updateProjectKnowledge(reviewer.id, project.id, { action: "disable", documentId: current.id, expectedRevision: current.revision });
    const fourth = await queuedTask();
    expect(fourth.codexThreadId).toBeUndefined();
    expect(fourth.knowledge).toMatchObject({ contextReset: true, documents: [] });
  });
});
