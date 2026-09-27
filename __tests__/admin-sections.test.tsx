import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminPage from "@/app/app/admin/page";

vi.mock("@/components/app/llm-settings", () => ({
  LlmSettings: function SettingsFixture() {
    const [model, setModel] = useState("");
    return <input aria-label="未保存模型名称" value={model} onChange={(event) => setModel(event.target.value)} />;
  },
}));
const overview = {
  counts: { users: 1, projects: 0, threads: 0, turns: 0, activeTurns: 0, pendingApprovals: 0 },
  runners: [], models: [], projects: [], auditLogs: [],
  users: [{ id: "test-user", email: "admin@example.invalid", name: "Test", role: "admin", createdAt: "2026-09-19T00:00:00Z" }],
};
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => overview })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows one functional section at a time, with overview selected initially", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  const nav = await screen.findByRole("navigation", { name: "管理功能分区" });
  expect(within(nav).getAllByRole("button")).toHaveLength(6);
  expect(screen.getAllByRole("region")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "最近项目" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "用户与密码重置" })).toBeNull();
  for (const [label, heading] of [["Runner 节点", "Runner 节点"], ["用户管理", "用户与密码重置"], ["审计日志", "审计日志"]]) {
    await user.click(within(nav).getByRole("button", { name: label }));
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(within(nav).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  }
});

it("retains unsaved model input across section switches without making writes", async () => {
  const user = userEvent.setup();
  render(<AdminPage />);
  const nav = await screen.findByRole("navigation", { name: "管理功能分区" });
  await user.click(within(nav).getByRole("button", { name: "模型设置" }));
  await user.type(screen.getByRole("textbox", { name: "未保存模型名称" }), "pending-model");
  await user.click(within(nav).getByRole("button", { name: "概览" }));
  await user.click(within(nav).getByRole("button", { name: "模型设置" }));
  expect(screen.getByRole("textbox", { name: "未保存模型名称" })).toHaveValue("pending-model");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not expose management panels when the overview API denies access", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "仅管理员可以查看平台管理台" }) } as Response);
  render(<AdminPage />);
  expect(await screen.findByText("仅管理员可以查看平台管理台")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "管理功能分区" })).toBeNull();
});
