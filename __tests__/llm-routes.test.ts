// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/admin/llm/route";
import { POST as testModel } from "@/app/api/admin/llm/test/route";
import { POST as design } from "@/app/api/design/route";
import { GET as runnerConfig } from "@/app/api/runners/model-config/route";
import { createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import { callLlm, LlmRequestError } from "@/lib/server/llm-client";
import { publicLlm, saveLlm } from "@/lib/server/llm-settings";
import { processNextDesign } from "@/lib/server/design-job-worker";
import { claimDesign, finishDesign } from "@/lib/server/design-job-store";
vi.mock("@/lib/server/design-job-store", () => ({ claimDesign: vi.fn(), finishDesign: vi.fn(), enqueueDesign: vi.fn(), listDesigns: vi.fn(), DesignJobError: class extends Error {} }));

vi.mock("@/lib/server/llm-client", async (original) => ({ ...await original<typeof import("@/lib/server/llm-client")>(), callLlm: vi.fn(), providerAddress: vi.fn().mockResolvedValue({ address: "8.8.8.8", family: 4 }) }));
beforeEach(() => { globalThis.__vibehardLlmSettings?.clear(); vi.mocked(callLlm).mockReset(); });
const input = { purpose: "design" as const, model: "design-model", baseUrl: "https://example.com/v1", protocol: "chat-completions" as const, apiKey: "secret-123456", revision: null };
async function user(admin = false) {
  const record = await createUser({ email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test", inviteCode: "test" });
  if (admin) record.role = "admin";
  return { record, cookie: `vibehard_session=${createSessionToken(record)}` };
}
const req = (path: string, cookie = "", body?: unknown, method = "POST") => new NextRequest(`https://example.com${path}`, { method: body ? method : "GET", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
describe("LLM routes", () => {
  it("blocks anonymous and ordinary members from reading, saving and testing credentials", async () => {
    expect((await GET(req("/api/admin/llm"))).status).toBe(401);
    const { cookie } = await user();
    expect((await GET(req("/api/admin/llm", cookie))).status).toBe(403);
    expect((await PUT(req("/api/admin/llm", cookie, input, "PUT"))).status).toBe(403);
    expect((await testModel(req("/api/admin/llm/test", cookie, input))).status).toBe(403);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("saves without echoing the key and tests unsaved credentials without activating them", async () => {
    const { cookie } = await user(true);
    vi.mocked(callLlm).mockImplementation(async (_c, _s, p) => p.replace("Reply with exactly ", ""));
    expect((await testModel(req("/api/admin/llm/test", cookie, input))).status).toBe(200);
    expect((await publicLlm("design")).hasApiKey).toBe(false);
    const saved = await PUT(req("/api/admin/llm", cookie, input, "PUT"));
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain(input.apiKey);
    expect(await (await GET(req("/api/admin/llm", cookie))).text()).not.toContain(input.apiKey);
  });
  it("requires authentication and configuration for real generation", async () => {
    expect((await design(req("/api/design", "", { requirement: "test" }))).status).toBe(401);
    const { cookie } = await user();
    expect((await design(req("/api/design", cookie, { requestId: crypto.randomUUID(), requirement: "test" }))).status).toBe(503);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("sends the user's requirement to the configured model and rejects fabricated fallbacks", async () => {
    const { record } = await user();
    await saveLlm(input, record.id);
    const result = { architecture: ["用户专属方案"], bom: [{ item: "主控", model: "ESP32-C3-MINI-1", qty: 1, estCost: "¥12–18/件（小批量估算）" }], interfaces: ["USB"], risks: [{ level: "中", desc: "验证供电并在采购前询价" }] };
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify(result));
    vi.mocked(claimDesign).mockResolvedValue({ id: "job", leaseToken: "lease", requirement: "独立的机器人方案" } as Awaited<ReturnType<typeof claimDesign>>);
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", expect.objectContaining({ result }));
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ model: "design-model" }), expect.any(String), "独立的机器人方案", expect.any(AbortSignal), 90_000);
    expect(vi.mocked(callLlm).mock.calls[0][1]).toContain("内置方案知识库（基础工程规则）");
    expect(vi.mocked(callLlm).mock.calls[0][1]).toContain("人民币参考单价范围");
    vi.mocked(callLlm).mockRejectedValue(new LlmRequestError("模型服务额度不足"));
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", { error: "模型服务额度不足" });
    vi.mocked(callLlm).mockResolvedValue("not json");
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", { error: expect.stringContaining("格式不正确") });
  });
  it("rejects a generated BOM that omits its reference price", async () => {
    const { record } = await user();
    await saveLlm(input, record.id);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ architecture: ["方案"], bom: [{ item: "主控", model: "待选", qty: 1, estCost: "未核价" }], interfaces: ["USB"], risks: [{ level: "中", desc: "验证" }] }));
    vi.mocked(claimDesign).mockResolvedValue({ id: "job", leaseToken: "lease", requirement: "带主控的方案" } as Awaited<ReturnType<typeof claimDesign>>);
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", { error: expect.stringContaining("字段不完整") });
  });
  it("does not release provider credentials to browsers or device nodes", async () => {
    const { cookie } = await user(true);
    const response = await runnerConfig(req(`/api/runners/model-config?taskId=${crypto.randomUUID()}`, cookie));
    expect(response.status).toBe(403);
  });
});
