// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { processNextDesign } from "@/lib/server/design-job-worker";
import { LlmRequestError, upstreamError, llmRequestBody } from "@/lib/server/llm-client";
import { expiredDiagnostics, queuedDiagnostics } from "@/lib/agent/design-diagnostics";

const result = { architecture: ["MCU"], bom: [{ item: "主控", model: "MCU", qty: 1, estCost: "¥5 估算" }], interfaces: ["UART"], risks: [{ level: "低", desc: "核验" }] };
function fixture() {
  return {
    claimDesign: vi.fn().mockResolvedValue({ id: "job", userId: "owner", projectId: "project", leaseToken: "lease", requirement: "private requirement", createdAt: new Date(), diagnostics: queuedDiagnostics(new Date(Date.now() - 1000)) }),
    finishDesign: vi.fn().mockResolvedValue(true), saveDesignDiagnostics: vi.fn().mockResolvedValue(true),
    runtimeLlm: vi.fn().mockResolvedValue({ baseUrl: "https://example.invalid", model: "test", revision: "revision-1", protocol: "responses", apiKey: "secret-not-for-logs" }),
    retrieveDesignKnowledge: vi.fn().mockResolvedValue({ status: "no-match", method: "keyword-chunks-v1", references: [], context: "" }),
    callLlm: vi.fn().mockResolvedValue(JSON.stringify(result)),
  };
}
afterEach(() => vi.useRealTimers());
it("records ordered phases and model revision without input, key, raw response, and only one model call", async () => {
  const deps = fixture(); await processNextDesign(deps);
  expect(deps.saveDesignDiagnostics.mock.calls.map(c => c[2].currentPhase)).toEqual(["config", "retrieval", "model", "validation", "saving"]);
  expect(deps.callLlm).toHaveBeenCalledTimes(1);
  const d = deps.finishDesign.mock.calls[0][2].diagnostics;
  expect(d).toMatchObject({ modelRevision: "revision-1", currentPhase: "saving" });
  expect(JSON.stringify(d)).not.toMatch(/private requirement|secret-not-for-logs|estCost/);
});
it.each(["runtimeLlm", "retrieveDesignKnowledge", "callLlm"] as const)("times out hung %s at the exact stage, persists error, and never retries", async name => {
  vi.useFakeTimers(); const deps = fixture(); deps[name].mockImplementation(() => new Promise(() => {}));
  const work = processNextDesign(deps, 100); await vi.advanceTimersByTimeAsync(101); await work;
  const outcome = deps.finishDesign.mock.calls[0][2];
  expect(outcome.diagnostics.errorCode).toBe("TIMEOUT");
  expect(outcome.diagnostics.currentPhase).toBe({ runtimeLlm: "config", retrieveDesignKnowledge: "retrieval", callLlm: "model" }[name]);
  expect(outcome.diagnostics.totalMs).toBe(100); expect(deps.callLlm.mock.calls.length).toBeLessThanOrEqual(1);
});
it.each(["not json", JSON.stringify({ architecture: [] })])("retains format failure at validation without writing raw content", async text => {
  const deps = fixture(); deps.callLlm.mockResolvedValue(text); await processNextDesign(deps);
  expect(deps.finishDesign.mock.calls[0][2]).toMatchObject({ diagnostics: { errorCode: "FORMAT", currentPhase: "validation" } });
});
it("discards even malformed model-authored citations and retains only server evidence", async () => {
  const deps = fixture(); deps.callLlm.mockResolvedValue(JSON.stringify({ ...result, retrieval: { references: "forged" } }));
  await processNextDesign(deps);
  expect(deps.finishDesign.mock.calls[0][2].result.retrieval).toMatchObject({ status: "no-match", references: [] });
});
it("aborts before the model when lease is lost", async () => {
  const deps = fixture(); deps.saveDesignDiagnostics.mockResolvedValue(false); await processNextDesign(deps);
  expect(deps.callLlm).not.toHaveBeenCalled();
  expect(deps.finishDesign.mock.calls[0][2].diagnostics.errorCode).toBe("LEASE_EXPIRED");
});
it("ignores a late configuration result after timeout and never advances to a paid model call", async () => {
  vi.useFakeTimers(); const deps = fixture(); let release!: (value: unknown) => void;
  deps.runtimeLlm.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const work = processNextDesign(deps, 100); await vi.advanceTimersByTimeAsync(101); await work;
  release({ model: "late", protocol: "responses", revision: "old", apiKey: "secret" }); await vi.advanceTimersByTimeAsync(1);
  expect(deps.callLlm).not.toHaveBeenCalled(); expect(deps.finishDesign).toHaveBeenCalledTimes(1);
  expect(deps.finishDesign.mock.calls[0][2].diagnostics.currentPhase).toBe("config");
});
it.each(["DNS", "CONNECT", "RATE_LIMIT", "AUTH"] as const)("preserves sanitized %s errors", async code => {
  const deps = fixture(); deps.callLlm.mockRejectedValue(new LlmRequestError("safe", 502, code)); await processNextDesign(deps);
  expect(deps.finishDesign.mock.calls[0][2].diagnostics.errorCode).toBe(code);
});
it("distinguishes provider quota/rate limit and legacy/expired diagnostics", () => {
  expect(upstreamError(429).code).toBe("RATE_LIMIT"); expect(upstreamError(429, "insufficient quota").code).toBe("QUOTA");
  expect(expiredDiagnostics(null, "running", new Date())).toBeNull();
  expect(expiredDiagnostics(queuedDiagnostics(new Date()), "queued", new Date())?.errorCode).toBe("QUEUE_EXPIRED");
});
it("bounds only DeepSeek design drafts, leaving other purposes/providers unchanged", () => {
  const config = { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-pro", protocol: "responses" as const, apiKey: "secret", revision: "v1" };
  expect(llmRequestBody(config, "JSON", "draft", undefined, { profile: "design-draft" })).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 8192 });
  expect(llmRequestBody(config, "JSON", "ping")).not.toHaveProperty("reasoning");
  expect(llmRequestBody({ ...config, baseUrl: "https://api.deepseek.com.example.invalid" }, "JSON", "draft", undefined, { profile: "design-draft" })).not.toHaveProperty("reasoning");
  expect(llmRequestBody({ ...config, protocol: "chat-completions" }, "JSON", "draft", undefined, { profile: "design-draft" })).toMatchObject({ reasoning_effort: "low", max_tokens: 8192 });
});
