import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getThread } from "@/app/api/threads/[id]/route";
import { GET as getRunners } from "@/app/api/runners/route";
import { POST as createTurnRoute } from "@/app/api/threads/[id]/turns/route";
import { createProject, createThread, createUser, registerRunner } from "@/lib/server/store";
import { AUTH_COOKIE, createSessionToken } from "@/lib/server/security";

async function fixture() {
  const suffix = crypto.randomUUID();
  const user = await createUser({ email: `route-${suffix}@example.com`, passwordHash: "test", inviteCode: "TEST" });
  const project = await createProject(user.id, { name: "Route project", workspaceKey: `route-${suffix}` });
  const thread = await createThread(user.id, project.id, "Route thread");
  if (!thread) throw new Error("thread was not created");
  const cookie = `${AUTH_COOKIE}=${createSessionToken(user)}`;
  return { cookie, thread };
}

function turnRequest(cookie: string, input = "Inspect the project") {
  return new NextRequest("http://localhost/api/threads/test/turns", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ input, model: "gpt-5.6-sol", providerId: "tokenadvent" }),
  });
}

describe("Agent route handlers", () => {
  it("lists only authenticated available Runners", async () => {
    const { cookie } = await fixture();
    await registerRunner({ runnerKey: `device-${crypto.randomUUID()}`, name: "USB device Runner", capabilities: ["codex", "usb-device"] });
    expect((await getRunners(new NextRequest("http://localhost/api/runners"))).status).toBe(401);
    const response = await getRunners(new NextRequest("http://localhost/api/runners", { headers: { Cookie: cookie } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runners: expect.arrayContaining([expect.objectContaining({ name: "USB device Runner", capabilities: expect.arrayContaining(["usb-device"]) })]) });
  });
  it("rejects invalid resource ids before querying PostgreSQL", async () => {
    const { cookie } = await fixture();
    const response = await createTurnRoute(turnRequest(cookie), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "会话 ID 无效" });
  });

  it("returns 409 for a second active turn in the same thread", async () => {
    const { cookie, thread } = await fixture();
    const first = await createTurnRoute(turnRequest(cookie, "first"), { params: Promise.resolve({ id: thread.id }) });
    const second = await createTurnRoute(turnRequest(cookie, "second"), { params: Promise.resolve({ id: thread.id }) });
    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: expect.stringContaining("已有任务") });
  });

  it("serializes overview events with the same shape as SSE events", async () => {
    const { cookie, thread } = await fixture();
    await createTurnRoute(turnRequest(cookie), { params: Promise.resolve({ id: thread.id }) });
    const request = new NextRequest(`http://localhost/api/threads/${thread.id}`, { headers: { Cookie: cookie } });
    const response = await getThread(request, { params: Promise.resolve({ id: thread.id }) });
    expect(response.status).toBe(200);
    const overview = await response.json() as { events: Array<Record<string, unknown>> };
    expect(overview.events[0]).toMatchObject({ eventId: expect.any(String), sequence: expect.any(Number), timestamp: expect.any(String), data: expect.any(Object) });
    expect(overview.events[0]).not.toHaveProperty("payload");
  });
});
