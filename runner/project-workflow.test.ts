import { describe, expect, it } from "vitest";
import { ProjectWorkflow } from "./project-workflow";

describe("workflow evidence", () => {
  it("records actual command/file status, not inferred success from a completed turn", () => {
    const workflow = new ProjectWorkflow();
    workflow.observe("tool.completed", { item: { type: "commandExecution", command: "make test", status: "failed", exitCode: 2 } });
    workflow.observe("tool.completed", { item: { type: "fileChange", status: "declined", changes: [{ path: "main.c", kind: { type: "update" } }] } });
    workflow.observe("approval.requested", { approvalId: "a", tool: "fileChange" });
    workflow.decide("a", "reject");
    const report = workflow.finish("task.completed");
    expect(report).toContain("状态 failed | exit=2");
    expect(report).toContain("main.c | update | 应用状态 declined");
    expect(report).toContain("拒绝");
    expect(report).toContain("烧录与硬件效果未由本报告验证");
    expect(workflow.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not treat deltas, model claims or missing exit codes as verification", () => {
    const workflow = new ProjectWorkflow();
    workflow.observe("agent.message", { text: "All tests passed" });
    workflow.observe("command.output", { text: "PASS" });
    expect(workflow.finish("task.interrupted")).toContain("未记录完成命令");
    workflow.observe("tool.completed", { item: { type: "commandExecution", command: "test" } });
    expect(workflow.finish("task.failed")).toContain("exit=未知");
  });
  it("bounds retained evidence and reports truncation", () => {
    const workflow = new ProjectWorkflow();
    for (let index = 0; index < 300; index++) workflow.observe("tool.completed", { item: { type: "commandExecution", command: "x".repeat(10000) } });
    const report = workflow.finish("task.completed");
    expect(report.length).toBeLessThan(70000);
    expect(report).toContain("省略 200 条");
  });
});
