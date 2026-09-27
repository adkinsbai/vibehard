import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/[id]/knowledge/route";
import { GET as reviewQueue } from "@/app/api/knowledge/review/route";
import { GET as adminOverview } from "@/app/api/admin/overview/route";
import { GET as adminLlm } from "@/app/api/admin/llm/route";
import { POST as resetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { changeKnowledge, KnowledgeConflict, publishedSnapshot } from "@/lib/server/knowledge-state";
import { getProjectKnowledge, updateProjectKnowledge } from "@/lib/server/knowledge-store";
import { prepareKnowledge } from "@/lib/server/knowledge-dispatch";
import { KNOWLEDGE_CAPABILITY, knowledgeSnapshotSchema, needsKnowledgeReview, type KnowledgeDraft } from "@/lib/agent/knowledge";
import { AUTH_COOKIE, createSessionToken } from "@/lib/server/security";
import { createProject, createThread, createTurn, createUser, getThreadOverview, registerRunner } from "@/lib/server/store";
import { knowledgeInput } from "@/runner/project-knowledge";

const draft: KnowledgeDraft = { title: "PINMAP", source: "schematic.pdf p2（待实测）", kind: "schematic", content: "LED: GPIO1，未上板验证" };
const owner = "d4eaf003-f3f9-4a0b-8e08-200f7a0bc843";
const create = () => changeKnowledge([], { action: "create", draft }, owner);
const publish = (documents: ReturnType<typeof create>) => changeKnowledge(documents, { action: "publish", documentId: documents[0].id, expectedRevision: documents[0].revision, confirmed: true }, owner);

describe("project knowledge state and dispatch", () => {
  it("keeps drafts out of snapshots and preserves published versions on edit/restore/disable", () => {
    const initial = create();
    expect(publishedSnapshot(initial).documents).toEqual([]);
    const v1 = publish(initial);
    const snap = publishedSnapshot(v1);
    const edited = changeKnowledge(v1, { action: "edit", documentId: v1[0].id, expectedRevision: v1[0].revision, draft: { ...draft, content: "new draft" } }, owner);
    expect(publishedSnapshot(edited)).toEqual(snap);
    const v2 = publish(edited);
    expect(v2[0].versions.map(version => version.content)).toEqual([draft.content, "new draft"]);
    const restored = changeKnowledge(v2, { action: "restore-draft", documentId: v2[0].id, expectedRevision: v2[0].revision, version: 1 }, owner);
    expect(restored[0].draft.content).toBe(draft.content);
    expect(publishedSnapshot(restored)).toEqual(publishedSnapshot(v2));
    const disabled = changeKnowledge(restored, { action: "disable", documentId: restored[0].id, expectedRevision: restored[0].revision }, owner);
    expect(publishedSnapshot(disabled).documents).toEqual([]);
    expect(disabled[0].versions).toHaveLength(2);
    expect(snap.documents[0].content).toBe(draft.content);
    expect(() => changeKnowledge(v2, { action: "publish", documentId: v2[0].id, expectedRevision: initial[0].revision, confirmed: true }, owner)).toThrow(KnowledgeConflict);
  });
  it("limits context, documents and history without mutating existing state", () => {
    let documents: ReturnType<typeof create> = [];
    for (let index = 0; index < 4; index++) {
      documents = changeKnowledge(documents, { action: "create", draft: { ...draft, content: "x".repeat(6000) } }, owner);
      const doc = documents.at(-1)!;
      documents = changeKnowledge(documents, { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true }, owner);
    }
    documents = changeKnowledge(documents, { action: "create", draft }, owner);
    const last = documents.at(-1)!;
    expect(() => changeKnowledge(documents, { action: "publish", documentId: last.id, expectedRevision: last.revision, confirmed: true }, owner)).toThrow("24000");
    expect(documents.at(-1)?.versions).toEqual([]);
    for (let index = 5; index < 20; index++) documents = changeKnowledge(documents, { action: "create", draft }, owner);
    expect(() => changeKnowledge(documents, { action: "create", draft }, owner)).toThrow("20");
    let history = create(); for (let index = 0; index < 20; index++) history = publish(history);
    expect(() => publish(history)).toThrow("20");
  });
  it("requires capable fresh Runner, resets changed context, preserves unchanged context", () => {
    const snapshot = publishedSnapshot(publish(create()));
    const runner = { capabilities: [KNOWLEDGE_CAPABILITY], status: "online", lastHeartbeatAt: new Date() };
    expect(() => prepareKnowledge(snapshot, null, undefined)).toThrow("Runner");
    expect(() => prepareKnowledge(snapshot, null, undefined, { ...runner, lastHeartbeatAt: new Date(0) })).toThrow("Runner");
    expect(() => prepareKnowledge(snapshot, null, undefined, { ...runner, capabilities: [] })).toThrow("Runner");
    expect(prepareKnowledge(snapshot, "native", undefined, runner).contextReset).toBe(true);
    expect(prepareKnowledge(snapshot, "native", snapshot, runner).contextReset).toBe(false);
    expect(prepareKnowledge(publishedSnapshot([]), "native", snapshot).contextReset).toBe(true);
    expect(prepareKnowledge(publishedSnapshot([]), "native", undefined).contextReset).toBe(false);
  });
  it("validates immutable snapshot hashes after wire parsing and never treats text as instructions", () => {
    const snapshot = publishedSnapshot(publish(create()));
    const wire = knowledgeSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    expect(knowledgeInput(wire)[0].text).toContain(draft.content);
    wire.documents[0].content = "tampered";
    expect(() => knowledgeInput(wire)).toThrow("校验失败");
  });
});

async function fixture() {
  const id = crypto.randomUUID();
  const user = await createUser({ email: `${id}@example.com`, passwordHash: "test", inviteCode: "test" });
  const project = await createProject(user.id, { name: "Knowledge project", workspaceKey: id });
  const cookie = `${AUTH_COOKIE}=${createSessionToken(user)}`;
  return { user, project, cookie, context: { params: Promise.resolve({ id: project.id }) } };
}
const request = (cookie: string, body?: unknown) => new NextRequest("http://localhost/api/projects/test/knowledge", {
  method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("knowledge authenticated routes", () => {
  it("uses persisted roles, rejects forged/stale privileged cookies, and scopes developers to knowledge review", async () => {
    const a = await fixture(), reviewer = await fixture();
    const docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "create", draft }))!;
    const action = { action: "publish", documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true };
    const forged = `${AUTH_COOKIE}=${createSessionToken({ ...a.user, role: "admin" })}`;
    expect((await POST(request(forged, action), a.context)).status).toBe(403);
    for (const restricted of [{ ...action, action: "disable" }, { action: "reject", documentId: docs[0].id, expectedRevision: docs[0].revision, reason: "test" }]) {
      const body = restricted.action === "disable" ? { action: "disable", documentId: docs[0].id, expectedRevision: docs[0].revision } : restricted;
      expect((await POST(request(a.cookie, body), a.context)).status).toBe(403);
    }
    expect((await reviewQueue(request(""))).status).toBe(401);
    expect((await reviewQueue(request(a.cookie))).status).toBe(403);
    reviewer.user.role = "developer";
    expect((await reviewQueue(request(reviewer.cookie))).status).toBe(200);
    expect((await adminOverview(request(reviewer.cookie))).status).toBe(403);
    expect((await adminLlm(request(reviewer.cookie))).status).toBe(403);
    expect((await resetPassword(request(reviewer.cookie, { password: "test-password" }), { params: Promise.resolve({ id: a.user.id }) })).status).toBe(403);
    const thread = (await createThread(a.user.id, a.project.id))!;
    expect(await getThreadOverview(reviewer.user.id, thread.id)).toBeNull();
    const privilegedCookie = `${AUTH_COOKIE}=${createSessionToken({ ...reviewer.user, role: "developer" })}`;
    reviewer.user.role = "member";
    expect((await POST(request(privilegedCookie, action), a.context)).status).toBe(403);
    expect((await reviewQueue(request(privilegedCookie))).status).toBe(403);
  });
  it("records rejection without revoking the formal version, and requires a fresh review after editing", async () => {
    const a = await fixture(), reviewer = await fixture(); reviewer.user.role = "developer";
    let docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "create", draft }))!;
    docs = (await updateProjectKnowledge(reviewer.user.id, a.project.id, { action: "publish", documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true }))!;
    const original = publishedSnapshot(docs);
    docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "edit", documentId: docs[0].id, expectedRevision: docs[0].revision, draft: { ...draft, content: "unverified change" } }))!;
    const action = { action: "reject", documentId: docs[0].id, expectedRevision: docs[0].revision, reason: "缺少原理图页码" };
    expect((await POST(request(reviewer.cookie, { ...action, reason: " " }), a.context)).status).toBe(400);
    const response = await POST(request(reviewer.cookie, action), a.context);
    expect(response.status).toBe(200);
    docs = (await response.json()).documents;
    expect(docs[0].rejection).toMatchObject({ reviewedBy: reviewer.user.id, reason: action.reason, revision: docs[0].revision });
    expect(needsKnowledgeReview(docs[0])).toBe(false);
    expect(publishedSnapshot(docs)).toEqual(original);
    expect((await POST(request(reviewer.cookie, action), a.context)).status).toBe(409);
    docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "edit", documentId: docs[0].id, expectedRevision: docs[0].revision, draft }))!;
    expect(docs[0].rejection).toBeUndefined(); expect(needsKnowledgeReview(docs[0])).toBe(true);
    expect(publishedSnapshot(docs)).toEqual(original);
  });
  it("paginates the review queue without returning private project paths or draft contents", async () => {
    const reviewer = await fixture(); reviewer.user.role = "admin";
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const a = await fixture(); ids.push(a.project.id);
      await updateProjectKnowledge(a.user.id, a.project.id, { action: "create", draft });
    }
    const seen = new Set<string>(); let cursor: string | null = null;
    do {
      const response = await reviewQueue(new NextRequest(`http://localhost/api/knowledge/review${cursor ? `?after=${cursor}` : ""}`, { headers: { Cookie: reviewer.cookie } }));
      expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.json(); expect(body.projects.length).toBeLessThanOrEqual(10);
      for (const project of body.projects) {
        expect(seen.has(project.id)).toBe(false); seen.add(project.id);
        expect(Object.keys(project).sort()).toEqual(["documents", "id", "name"]);
        expect(project.documents[0]).not.toHaveProperty("content");
      }
      cursor = body.nextCursor;
    } while (cursor);
    expect(ids.every(id => seen.has(id))).toBe(true);
    expect((await reviewQueue(new NextRequest("http://localhost/api/knowledge/review?after=bad", { headers: { Cookie: reviewer.cookie } }))).status).toBe(400);
  });
  it("owners submit but only privileged reviewers publish; reviewer access does not allow editing others' drafts", async () => {
    const a = await fixture(), b = await fixture();
    expect((await GET(request(""), a.context)).status).toBe(401);
    expect((await GET(request(b.cookie), a.context)).status).toBe(403);
    b.user.role = "admin";
    const view = await GET(request(b.cookie), a.context);
    expect(view.status).toBe(200);
    expect((await view.json()).permissions).toEqual({ canEdit: false, canReview: true });
    expect((await POST(request(b.cookie, { action: "create", draft }), a.context)).status).toBe(403);
    const saved = await POST(request(a.cookie, { action: "create", draft }), a.context);
    const { documents, publishedCount } = await saved.json();
    expect(publishedCount).toBe(0);
    const action = { action: "publish", documentId: documents[0].id, expectedRevision: documents[0].revision };
    expect((await POST(request(a.cookie, action), a.context)).status).toBe(400);
    expect((await POST(request(a.cookie, { ...action, confirmed: true }), a.context)).status).toBe(403);
    const published = await POST(request(b.cookie, { ...action, confirmed: true }), a.context);
    expect((await published.json()).publishedCount).toBe(1);
    expect((await POST(request(b.cookie, { ...action, confirmed: true }), a.context)).status).toBe(409);
    expect((await GET(request(a.cookie), a.context)).headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects malformed, oversized and forged publication fields", async () => {
    const a = await fixture();
    expect((await POST(request(a.cookie, { action: "create", draft, publishedVersion: 1 }), a.context)).status).toBe(400);
    expect((await POST(request(a.cookie, { action: "create", draft: { ...draft, content: "x".repeat(6001) } }), a.context)).status).toBe(400);
    expect((await POST(request(a.cookie, "x".repeat(65_000)), a.context)).status).toBe(413);
    expect((await GET(request(a.cookie), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
  });
  it("serializes simultaneous reviews and publishes at most once", async () => {
    const a = await fixture();
    a.user.role = "developer";
    const docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "create", draft }))!;
    const action = { action: "publish" as const, documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true as const };
    const responses = await Promise.all([POST(request(a.cookie, action), a.context), POST(request(a.cookie, action), a.context)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await getProjectKnowledge(a.user.id, a.project.id))![0].versions).toHaveLength(1);
  });
  it("captures only published manifest in local preview tasks and rejects old Runners", async () => {
    const a = await fixture();
    a.user.role = "admin";
    const docs = (await updateProjectKnowledge(a.user.id, a.project.id, { action: "create", draft }))!;
    const thread = (await createThread(a.user.id, a.project.id))!;
    const turn = (await createTurn(a.user.id, thread.id, "test", "fake"))!;
    expect((await getThreadOverview(a.user.id, thread.id))!.events.find(event => event.turnId === turn.id)?.payload.knowledge).toMatchObject({ documents: [] });
    await updateProjectKnowledge(a.user.id, a.project.id, { action: "publish", documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true });
    const nextThread = (await createThread(a.user.id, a.project.id))!;
    await expect(createTurn(a.user.id, nextThread.id, "test", "fake")).rejects.toThrow("Runner");
    await registerRunner({ runnerKey: a.project.runnerKey!, name: "Knowledge test Runner", capabilities: [KNOWLEDGE_CAPABILITY] });
    await createTurn(a.user.id, nextThread.id, "test", "fake");
    expect((await getThreadOverview(a.user.id, nextThread.id))!.events[0].payload.knowledge).toMatchObject({ documents: [{ version: 1, title: "PINMAP" }] });
  });
});
