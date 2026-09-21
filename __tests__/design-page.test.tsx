import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DesignWorkbench } from "@/components/app/design-workbench";
import type { DesignJob } from "@/lib/agent/design-jobs";
const projectId = "00000000-0000-4000-8000-000000000001";
const result = { architecture: ["已归档架构"], bom: [{ item: "主控", model: "MCU", qty: 1, estCost: "¥5（估算）" }], interfaces: ["UART"], risks: [{ level: "低" as const, desc: "需核验" }] };
function job(status: DesignJob["status"]): DesignJob {
  return { id: "00000000-0000-4000-8000-000000000002", projectId, projectName: "方案项目", requirement: "我的温度计需求", status,
    model: "test-model", knowledgeVersion: "test", result: status === "completed" ? result : null, error: status === "failed" ? "模型响应超时" : null,
    createdAt: new Date().toISOString(), startedAt: null, completedAt: null, deadlineAt: new Date(Date.now() + 600_000).toISOString() };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("creates once, returns a project immediately, and restores archived results after leaving", async () => {
  let saved: DesignJob | undefined;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/projects")) return Response.json({ projects: saved ? [{ id: projectId, name: saved.projectName }] : [] });
    if (init?.method === "POST") { saved = job("queued"); return Response.json({ job: saved }); }
    if (/\/api\/design(?:\?|$)/.test(url)) return Response.json({ jobs: saved ? [saved] : [], nextOffset: null });
    return Response.json({ job: saved });
  }); vi.stubGlobal("fetch", fetcher);
  const page = render(<DesignWorkbench />);
  await screen.findByText("暂无方案记录。提交后会立即保存需求。");
  expect(screen.getByText("已接入内置方案知识库，BOM 将自动填写人民币参考单价。")).toBeInTheDocument();
  expect(screen.queryByText(/不接入知识库|未接入知识库/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("功能需求"), { target: { value: "我的温度计需求" } });
  fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
  fireEvent.click(screen.getByRole("button", { name: /保存需求中|生成方案/ }));
  await screen.findByText("进入 Agent 项目");
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string)).toMatchObject({ requirement: "我的温度计需求", requestId: expect.any(String) });
  page.unmount(); saved = job("completed"); render(<DesignWorkbench projectId={projectId} />);
  await screen.findByText("已归档架构");
  expect(screen.getByText("下载方案 Markdown")).toHaveAttribute("href", expect.stringContaining(`/api/design/${saved.id}/download`));
});
it("retries failed requirements in their original project, preserving previous record", async () => {
  const saved = job("failed");
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/projects")) return Response.json({ projects: [{ id: projectId, name: "方案项目" }] });
    if (init?.method === "POST") return Response.json({ job: { ...job("queued"), id: "00000000-0000-4000-8000-000000000003" } });
    if (url.endsWith("/api/design")) return Response.json({ jobs: [saved], nextOffset: null });
    return Response.json({ job: saved });
  }); vi.stubGlobal("fetch", fetcher); render(<DesignWorkbench />);
  fireEvent.click(await screen.findByRole("button", { name: "在原项目重试" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  expect(JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string)).toMatchObject({ projectId, requirement: saved.requirement });
});
it("reuses the same idempotency key after an ambiguous submit failure", async () => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { bodies.push(String(init.body)); throw new Error("network unavailable"); }
    return Response.json(url.endsWith("/api/projects") ? { projects: [] } : { jobs: [], nextOffset: null });
  })); render(<DesignWorkbench />);
  await screen.findByText("暂无方案记录。提交后会立即保存需求。");
  fireEvent.change(screen.getByLabelText("功能需求"), { target: { value: "测试断网需求" } });
  fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
  await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[0]).toBe(bodies[1]);
});
