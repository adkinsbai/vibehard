// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/llm/models/route";
import { createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import { publicLlm, saveLlm } from "@/lib/server/llm-settings";
import { listProviderModels } from "@/lib/server/llm-models";

vi.mock("@/lib/server/llm-models", () => ({ listProviderModels: vi.fn() }));
beforeEach(() => { globalThis.__vibehardLlmSettings?.clear(); vi.mocked(listProviderModels).mockReset(); });

const input = { purpose: "design" as const, baseUrl: "https://provider.example/v1", apiKey: "test-secret-123", revision: null };
const request = (cookie = "", body: unknown = input) => new NextRequest("https://vibehard.example/api/admin/llm/models", {
  method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function session(role: "admin" | "member") {
  const user = await createUser({ email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test", inviteCode: "test" });
  user.role = role;
  return `vibehard_session=${createSessionToken(user)}`;
}

it("requires administrator permission before contacting a provider", async () => {
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request(await session("member")))).status).toBe(403);
  expect(listProviderModels).not.toHaveBeenCalled();
});

it("discovers without saving, and can reuse only the same endpoint's stored key", async () => {
  const cookie = await session("admin");
  vi.mocked(listProviderModels).mockResolvedValue([{ id: "model-a", name: "Model A" }]);
  const first = await POST(request(cookie));
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ models: [{ id: "model-a", name: "Model A" }] });
  expect(listProviderModels).toHaveBeenCalledWith(input.baseUrl, input.apiKey, expect.any(AbortSignal));
  expect((await publicLlm("design")).hasApiKey).toBe(false);

  const saved = await saveLlm({ ...input, model: "model-a", protocol: "responses" }, null);
  const second = await POST(request(cookie, { purpose: "design", baseUrl: input.baseUrl, revision: saved.revision }));
  expect(second.status).toBe(200);
  expect(await second.text()).not.toContain(input.apiKey);
  expect(listProviderModels).toHaveBeenCalledTimes(2);

  const changed = await POST(request(cookie, { purpose: "design", baseUrl: "https://another.example/v1", revision: saved.revision }));
  expect(changed.status).toBe(400);
  expect(listProviderModels).toHaveBeenCalledTimes(2);
});
