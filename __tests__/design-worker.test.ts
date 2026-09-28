// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { boundedDesign, processNextDesign } from "@/lib/server/design-job-worker";
import { queuedDiagnostics } from "@/lib/agent/design-diagnostics";
import { designJobInput, designMarkdown } from "@/lib/agent/design-jobs";
afterEach(() => vi.useRealTimers());
it("bounds blocked phase persistence and failure settlement, requiring worker recycling rather than orphan queries", async () => {
  vi.useFakeTimers();
  const deps = {
    claimDesign: vi.fn().mockResolvedValue({ id: crypto.randomUUID(), leaseToken: crypto.randomUUID(), createdAt: new Date(), diagnostics: queuedDiagnostics(new Date()) }),
    saveDesignDiagnostics: vi.fn().mockImplementation(() => new Promise(() => {})),
    finishDesign: vi.fn().mockImplementation(() => new Promise(() => {})),
    runtimeLlm: vi.fn(), retrieveDesignKnowledge: vi.fn(), callLlm: vi.fn(),
  };
  let outcome = "pending";
  const work = processNextDesign(deps, 100).then(() => { outcome = "returned"; }, error => { outcome = error.name; });
  await vi.advanceTimersByTimeAsync(101);
  expect(outcome).toBe("DesignStorageUnavailableError");
  await work;
  expect(deps.callLlm).not.toHaveBeenCalled();
});
it("recycles after a timed-out configuration query even if the failure record was saved", async () => {
  vi.useFakeTimers();
  const deps = {
    claimDesign: vi.fn().mockResolvedValue({ id: crypto.randomUUID(), leaseToken: crypto.randomUUID(), createdAt: new Date(), diagnostics: queuedDiagnostics(new Date()) }),
    saveDesignDiagnostics: vi.fn().mockResolvedValue(true),
    finishDesign: vi.fn().mockResolvedValue(true),
    runtimeLlm: vi.fn().mockImplementation(() => new Promise(() => {})),
    retrieveDesignKnowledge: vi.fn(), callLlm: vi.fn(),
  };
  let outcome = "pending";
  const work = processNextDesign(deps, 100).then(() => { outcome = "returned"; }, error => { outcome = error.name; });
  await vi.advanceTimersByTimeAsync(101);
  await work;
  expect(outcome).toBe("DesignStorageUnavailableError");
  expect(deps.finishDesign).toHaveBeenCalledWith(expect.any(String), expect.any(String),
    expect.objectContaining({ diagnostics: expect.objectContaining({ errorCode: "TIMEOUT" }) }), expect.any(Number));
  expect(deps.callLlm).not.toHaveBeenCalled();
});
it("enforces a hard deadline even when DNS/config/provider never resolves", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const promise = boundedDesign(s => { signal = s; return new Promise(() => {}); }, 100);
  const assertion = expect(promise).rejects.toThrow("模型响应超时");
  await vi.advanceTimersByTimeAsync(101); await assertion; expect(signal?.aborted).toBe(true);
});
it("does not mask a successful result and clears the deadline", async () => {
  vi.useFakeTimers(); expect(await boundedDesign(async () => "done", 100)).toBe("done"); expect(vi.getTimerCount()).toBe(0);
});
it("persists server-selected BOM price evidence and strips a model-supplied price", async () => {
  const deps = {
    claimDesign: vi.fn().mockResolvedValue({ id: crypto.randomUUID(), userId: crypto.randomUUID(), projectId: crypto.randomUUID(),
      requirement: "BH1750 光照检测", leaseToken: crypto.randomUUID(), createdAt: new Date(), diagnostics: queuedDiagnostics(new Date()) }),
    saveDesignDiagnostics: vi.fn().mockResolvedValue(true),
    finishDesign: vi.fn().mockResolvedValue(true),
    runtimeLlm: vi.fn().mockResolvedValue({ baseUrl: "https://example.invalid/v1", model: "test-model", protocol: "responses", apiKey: "test-key", revision: crypto.randomUUID() }),
    retrieveDesignKnowledge: vi.fn().mockResolvedValue({ status: "no-match", method: "keyword-chunks-v1", references: [], context: "" }),
    callLlm: vi.fn().mockResolvedValue(JSON.stringify({ architecture: ["I2C"], interfaces: ["I2C"], risks: [{ level: "低", desc: "核价" }], bom: [
      { item: "光照", model: "BH1750FVI-TR", qty: 1, estCost: "¥6–10/件（估算）", referencePrice: { kind: "supplier", display: "伪造报价" } },
    ] })),
  };
  expect(await processNextDesign(deps, 5000)).toBe(true);
  const saved = deps.finishDesign.mock.calls[0][2];
  expect(saved.result.bom[0].referencePrice).toMatchObject({ display: "US$0.9515/件", checkedAt: "2026-09-28", supplierSku: "C78960" });
  expect(JSON.stringify(saved.result)).not.toContain("伪造报价");
});
it("requires idempotency IDs and rejects invalid projects/oversized input", () => {
  expect(designJobInput.safeParse({ requestId: crypto.randomUUID(), requirement: "valid requirement" }).success).toBe(true);
  expect(designJobInput.safeParse({ requirement: "missing key" }).success).toBe(false);
  expect(designJobInput.safeParse({ requestId: crypto.randomUUID(), requirement: "x".repeat(12001) }).success).toBe(false);
  expect(designJobInput.safeParse({ requestId: crypto.randomUUID(), requirement: "test", projectId: "other" }).success).toBe(false);
});
it("does not create a fabricated markdown report for a failed task", () => {
  expect(() => designMarkdown({ result: null } as Parameters<typeof designMarkdown>[0])).toThrow("尚未生成");
});

it("labels supplier snapshots and estimated BOM rows in the downloaded design", () => {
  const markdown = designMarkdown({
    id: "design", projectId: "project", projectName: "测试工程", requirement: "测试", model: "test-model",
    knowledgeVersion: null, completedAt: "2026-09-28T00:00:00.000Z",
    result: { architecture: ["测试架构"], interfaces: ["I2C"], risks: [{ level: "低", desc: "核价" }], bom: [
      { item: "光照", model: "BH1750FVI-TR", qty: 1, estCost: "¥6–10/件（估算）" },
      { item: "主控", model: "ESP32-C3-MINI-1 或同类", qty: 1, estCost: "¥10–18/件（估算）" },
    ] },
  } as Parameters<typeof designMarkdown>[0]);
  expect(markdown).toContain("US$0.9515/件（LCSC C78960");
  expect(markdown).toContain("¥10–18/件（估算）");
  expect(markdown).not.toContain("¥10–18/件（估算）（模型估算）");
  expect(markdown).toContain("https://www.lcsc.com/product-detail/C78960.html");
});
