// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock('@/lib/server/retrieval-client', () => ({ queryPrivateIndex: vi.fn().mockResolvedValue({ sources: [], revision: 'a'.repeat(64) }) }));
import { queryPrivateIndex } from '@/lib/server/retrieval-client';
import { retrieveAuthorizedKnowledge } from '@/lib/server/knowledge-retrieval-service';
import { requireDb } from "@/lib/db";
import { sharedKnowledge, users } from "@/lib/db/schema";
import { createProject, createUser } from "@/lib/server/store";
import { updateProjectKnowledge } from "@/lib/server/knowledge-store";
import { retrieveDesignKnowledge } from "@/lib/server/design-knowledge";
import { listSharedKnowledge, mutateSharedKnowledge } from "@/lib/server/shared-knowledge-store";

const enabled = process.env.VIBEHARD_RAG_TEST_DATABASE === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/vibehard_rag_test") throw new Error("Refusing non-disposable RAG test database");
}
(enabled ? describe : describe.skip)("shared knowledge PostgreSQL boundaries", () => {
  const people: string[] = []; const entries: string[] = [];
  afterEach(async () => {
    if (entries.length) await requireDb().delete(sharedKnowledge).where(inArray(sharedKnowledge.id, entries.splice(0)));
    if (people.length) await requireDb().delete(users).where(inArray(users.id, people.splice(0)));
  });
  async function person(role: "member" | "developer" = "member") {
    const created = await createUser({ email: `${randomUUID()}@example.invalid`, passwordHash: "test", inviteCode: "test" });
    people.push(created.id);
    if (role === "developer") await requireDb().update(users).set({ role }).where(eq(users.id, created.id));
    return created.id;
  }
  it("retrieves only published shared text and the owner's published project text", async () => {
    const owner = await person(); const outsider = await person(); const reviewer = await person("developer");
    const project = await createProject(owner, { name: "RAG owner", workspaceKey: randomUUID() });
    const otherProject = await createProject(outsider, { name: "Other", workspaceKey: randomUUID() });
    const draft = { title: "SHT40 温湿度", source: "approved.md", kind: "sdk" as const, content: "SHT40 温湿度传感器通过 I2C 接口读取。" };
    await expect(listSharedKnowledge(owner)).rejects.toThrow();
    await expect(mutateSharedKnowledge(owner, "manuals", { action: "create", draft })).rejects.toThrow();
    const entry = await mutateSharedKnowledge(reviewer, "manuals", { action: "create", draft }); entries.push(entry.id);
    expect((await retrieveDesignKnowledge(owner, project.id, "SHT40 温湿度"))?.status).toBe("no-match");
    const reviewed = await mutateSharedKnowledge(reviewer, "manuals", { action: "publish", documentId: entry.id, expectedRevision: entry.document.revision, confirmed: true });
    const sharedResult = await retrieveDesignKnowledge(owner, project.id, "SHT40 温湿度");
    expect(sharedResult.references).toMatchObject([{ id: entry.id, scope: "platform", version: 1 }]);
    expect((await retrieveAuthorizedKnowledge({ userId: owner, query: 'SHT40 温湿度', purpose: 'eda' })).references).toMatchObject([{ id: entry.id }]);
    await expect(retrieveAuthorizedKnowledge({ userId: owner, projectId: otherProject.id, query: 'SHT40', purpose: 'eda' })).rejects.toThrow('无权访问');
    vi.mocked(queryPrivateIndex).mockRejectedValueOnce(new Error('unavailable'));
    const partial = await retrieveDesignKnowledge(owner, project.id, 'SHT40 温湿度');
    expect(partial).toMatchObject({ status: 'partial', warnings: ['INDEX_UNAVAILABLE'], references: [{ id: entry.id }] });
    const privateMarker = `private${randomUUID().replaceAll("-", "")}`;
    const privateDraft = { title: "私有 SPI 总线", source: "private.md", kind: "manual" as const, content: `私有 SPI 总线使用独立片选。${privateMarker}` };
    const privateDocuments = (await updateProjectKnowledge(outsider, otherProject.id, { action: "create", draft: privateDraft }))!;
    await updateProjectKnowledge(reviewer, otherProject.id, { action: "publish", documentId: privateDocuments[0].id, expectedRevision: privateDocuments[0].revision, confirmed: true });
    expect((await retrieveDesignKnowledge(owner, project.id, privateMarker)).status).toBe("no-match");
    expect((await retrieveDesignKnowledge(outsider, otherProject.id, privateMarker)).references).toMatchObject([{ scope: "project", projectId: otherProject.id }]);
    await expect(retrieveDesignKnowledge(owner, otherProject.id, privateMarker)).rejects.toThrow("无权访问");
    const disabled = await mutateSharedKnowledge(reviewer, "manuals", { action: "disable", documentId: entry.id, expectedRevision: reviewed.document.revision });
    expect(disabled.document.publishedVersion).toBeNull();
    expect((await retrieveDesignKnowledge(owner, project.id, "SHT40 温湿度")).status).toBe("no-match");
    expect((await retrieveDesignKnowledge(owner, project.id, 'SHT40 温湿度')).revision).not.toBe(sharedResult.revision);
  });
});
