// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/admin/llm/route";
import { POST as testModel } from "@/app/api/admin/llm/test/route";
import { POST as discoverModels } from "@/app/api/admin/llm/models/route";
import { POST as design } from "@/app/api/design/route";
import { GET as runnerConfig } from "@/app/api/runners/model-config/route";
import { createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import { callLlm, LlmRequestError } from "@/lib/server/llm-client";
import { publicLlm, saveLlm } from "@/lib/server/llm-settings";
import { processNextDesign } from "@/lib/server/design-job-worker";
import { claimDesign, finishDesign } from "@/lib/server/design-job-store";
import { retrieveDesignKnowledge } from "@/lib/server/design-knowledge";
import { listProviderModels } from "@/lib/server/llm-models";
vi.mock("@/lib/server/llm-models", () => ({ listProviderModels: vi.fn() }));
vi.mock("@/lib/server/design-knowledge", () => ({ retrieveDesignKnowledge: vi.fn().mockResolvedValue({ status: "no-match", method: "keyword-chunks-v1", references: [], context: "" }) }));
vi.mock("@/lib/server/design-job-store", () => ({ claimDesign: vi.fn(), finishDesign: vi.fn().mockResolvedValue(true), saveDesignDiagnostics: vi.fn().mockResolvedValue(true), enqueueDesign: vi.fn(), listDesigns: vi.fn(), DesignJobError: class extends Error {} }));

vi.mock("@/lib/server/llm-client", async (original) => ({ ...await original<typeof import("@/lib/server/llm-client")>(), callLlm: vi.fn(), providerAddress: vi.fn().mockResolvedValue({ address: "8.8.8.8", family: 4 }) }));
beforeEach(() => { globalThis.__vibehardLlmSettings?.clear(); vi.mocked(callLlm).mockReset(); vi.mocked(listProviderModels).mockReset(); vi.mocked(retrieveDesignKnowledge).mockResolvedValue({ status: "no-match", method: "keyword-chunks-v1", references: [], context: "" }); });
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
    expect((await discoverModels(req("/api/admin/llm/models", cookie, input))).status).toBe(403);
    expect(callLlm).not.toHaveBeenCalled();
    expect(listProviderModels).not.toHaveBeenCalled();
  });
  it("discovers models with unsaved or retained credentials without saving or exposing the key", async () => {
    const { cookie } = await user(true);
    vi.mocked(listProviderModels).mockResolvedValue([{ id: "model-a", name: "Model A" }]);
    const unsaved = await discoverModels(req("/api/admin/llm/models", cookie, { purpose: "design", baseUrl: input.baseUrl, apiKey: input.apiKey, revision: null }));
    expect(unsaved.status).toBe(200);
    expect(await unsaved.json()).toEqual({ models: [{ id: "model-a", name: "Model A" }] });
    expect(listProviderModels).toHaveBeenCalledWith(input.baseUrl, input.apiKey, expect.any(AbortSignal));
    expect((await publicLlm("design")).hasApiKey).toBe(false);
    const saved = await saveLlm(input, null);
    const retained = await discoverModels(req("/api/admin/llm/models", cookie, { purpose: "design", baseUrl: input.baseUrl, revision: saved.revision }));
    expect(retained.status).toBe(200);
    expect(await retained.text()).not.toContain(input.apiKey);
    expect(listProviderModels).toHaveBeenLastCalledWith(input.baseUrl, input.apiKey, expect.any(AbortSignal));
    const changed = await discoverModels(req("/api/admin/llm/models", cookie, { purpose: "design", baseUrl: "https://other.example/v1", revision: saved.revision }));
    expect(changed.status).toBe(400);
    expect(listProviderModels).toHaveBeenCalledTimes(2);
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
    vi.mocked(claimDesign).mockResolvedValue({ id: "job", createdAt: new Date(), leaseToken: "lease", requirement: "独立的机器人方案" } as Awaited<ReturnType<typeof claimDesign>>);
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", expect.objectContaining({ result: expect.objectContaining({ ...result, retrieval: { status: "no-match", method: "keyword-chunks-v1", references: [] } }) }), expect.any(Number));
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ model: "design-model" }), expect.any(String), "独立的机器人方案", expect.any(AbortSignal), expect.any(Number), undefined, expect.any(Object), { profile: "design-draft" });
    expect(vi.mocked(callLlm).mock.calls[0][4]).toBeLessThanOrEqual(90_000);
    expect(vi.mocked(callLlm).mock.calls[0][1]).toContain("内置方案知识库（基础工程规则）");
    expect(vi.mocked(callLlm).mock.calls[0][1]).toContain("人民币参考单价范围");
    vi.mocked(callLlm).mockRejectedValue(new LlmRequestError("模型服务额度不足"));
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", expect.objectContaining({ error: "模型服务额度不足" }));
    vi.mocked(callLlm).mockResolvedValue("not json");
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", expect.objectContaining({ error: expect.stringContaining("格式不正确") }));
  });
  it("rejects a generated BOM that omits its reference price", async () => {
    const { record } = await user();
    await saveLlm(input, record.id);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ architecture: ["方案"], bom: [{ item: "主控", model: "待选", qty: 1, estCost: "未核价" }], interfaces: ["USB"], risks: [{ level: "中", desc: "验证" }] }));
    vi.mocked(claimDesign).mockResolvedValue({ id: "job", createdAt: new Date(), leaseToken: "lease", requirement: "带主控的方案" } as Awaited<ReturnType<typeof claimDesign>>);
    await processNextDesign();
    expect(finishDesign).toHaveBeenLastCalledWith("job", "lease", expect.objectContaining({ error: expect.stringContaining("字段不完整") }));
  });
  it("sends reviewed context, but never accepts model-forged citations", async () => {
    const { record } = await user(); await saveLlm(input, record.id);
    const trusted = { scope: "platform" as const, id: crypto.randomUUID(), title: "已审核温度资料", source: "manual.md", version: 1, sha256: "a".repeat(64), excerpt: "SHT40 使用 I2C" };
    vi.mocked(retrieveDesignKnowledge).mockResolvedValue({ status: "matched", method: "keyword-chunks-v1", references: [trusted], context: "[资料 1] 已审核温度资料\nSHT40 使用 I2C" });
    vi.mocked(claimDesign).mockResolvedValue({ id: "job", createdAt: new Date(), leaseToken: "lease", userId: record.id, projectId: crypto.randomUUID(), requirement: "温度节点" } as Awaited<ReturnType<typeof claimDesign>>);
    vi.mocked(callLlm).mockResolvedValue(JSON.stringify({ architecture: ["I2C"], bom: [{ item: "传感器", model: "SHT40", qty: 1, estCost: "¥10（估算）" }], interfaces: ["I2C"], risks: [{ level: "低", desc: "核对地址" }], retrieval: { status: "matched", method: "keyword-chunks-v1", references: [{ ...trusted, title: "伪造资料" }] } }));
    await processNextDesign();
    expect(vi.mocked(callLlm).mock.calls[0][2]).toContain("[资料 1] 已审核温度资料");
    expect(vi.mocked(callLlm).mock.calls[0][1]).not.toContain("SHT40 使用 I2C");
    expect(finishDesign).toHaveBeenCalledWith("job", "lease", expect.objectContaining({ result: expect.objectContaining({ retrieval: { status: "matched", method: "keyword-chunks-v1", references: [trusted] } }) }), expect.any(Number));
  });
  it("does not release provider credentials to browsers or device nodes", async () => {
    const { cookie } = await user(true);
    const response = await runnerConfig(req(`/api/runners/model-config?taskId=${crypto.randomUUID()}`, cookie));
    expect(response.status).toBe(403);
  });
});
