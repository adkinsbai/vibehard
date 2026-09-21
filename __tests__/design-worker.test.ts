// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { boundedDesign } from "@/lib/server/design-job-worker";
import { designJobInput, designMarkdown } from "@/lib/agent/design-jobs";
afterEach(() => vi.useRealTimers());
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
