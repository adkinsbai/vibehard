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
it("enforces a hard deadline even when DNS/config/provider never resolves", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const promise = boundedDesign(s => { signal = s; return new Promise(() => {}); }, 100);
  const assertion = expect(promise).rejects.toThrow("模型响应超时");
  await vi.advanceTimersByTimeAsync(101); await assertion; expect(signal?.aborted).toBe(true);
});
it("does not mask a successful result and clears the deadline", async () => {
  vi.useFakeTimers(); expect(await boundedDesign(async () => "done", 100)).toBe("done"); expect(vi.getTimerCount()).toBe(0);
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
