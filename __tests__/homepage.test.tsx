import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home, { metadata } from "@/app/page";
import { HomeNav } from "@/components/home/home-nav";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>切换主题</button> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const session = (authenticated: boolean) => ({ ok: true, json: async () => ({ authenticated }) });

describe("public homepage", () => {
  it("introduces shipped capabilities and honest access boundaries without exposing catalog records", async () => {
    const fetcher = vi.fn().mockResolvedValue(session(false)); vi.stubGlobal("fetch", fetcher);
    const { container } = render(<Home />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const name of ["云端 Agent 项目", "硬件方案与 BOM", "原理图识别与申请", "项目知识与审核", "知识库与开发板选型", "研发工具与流程演示"]) {
      expect(screen.getByRole("heading", { name })).toBeVisible();
    }
    expect(screen.getByText("当前为目录展示，原始文件下载尚未接入")).toBeVisible();
    expect(screen.getByText("模型调用仍在优化，可能超时")).toBeVisible();
    expect(screen.getByText("演示不代表已完成真实硬件闭环")).toBeVisible();
    expect(screen.getByText("工作流示意 · 非实时任务")).toBeVisible();
    expect(container.textContent).not.toMatch(/850\+|ESP32-S3-Touch|后台生成|自动创建项目/);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/auth\/session$/);
    expect(metadata.description).toContain("即将开放注册使用");
  });

  it("keeps login, demo and invited registration links while making the public CTA an information anchor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(session(false)));
    const { container } = render(<Home />);
    expect(screen.getByRole("heading", { name: "即将开放注册使用" })).toBeVisible();
    const announcement = screen.getByRole("link", { name: "即将开放注册使用，查看开放说明" });
    expect(announcement).toHaveAttribute("href", "#access");
    expect(announcement.querySelector(".text-xl")).toHaveTextContent("即将开放注册使用");
    expect(announcement).toHaveTextContent("当前为邀请码内测");
    expect(screen.getByRole("link", { name: "即将开放" })).toHaveAttribute("href", "#access");
    expect(screen.getByRole("link", { name: "使用已有邀请码注册" })).toHaveAttribute("href", "/register");
    expect(container.querySelectorAll('a[href="/register"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "观看流程演示" })).toHaveAttribute("href", "/demo");
    for (const link of screen.getAllByRole("link", { name: "登录" })) expect(link).toHaveAttribute("href", "/login");
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(container.querySelector(anchor.getAttribute("href")!)).not.toBeNull();
    }
    const question = screen.getByText("现在可以注册使用吗？");
    const details = question.closest("details")!;
    expect(details.open).toBe(false);
    await userEvent.setup().click(question);
    expect(details.open).toBe(true);
    expect(details).toHaveTextContent("具体开放时间以官网公告为准");
  });

  it("preserves authenticated navigation and refreshes on logout", async () => {
    const fetcher = vi.fn().mockResolvedValue(session(true)); vi.stubGlobal("fetch", fetcher);
    render(<HomeNav />);
    expect(await screen.findByRole("link", { name: "进入工作台" })).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("link", { name: "即将开放" })).toBeNull();
    fetcher.mockResolvedValue(session(false));
    fireEvent(window, new Event(AUTH_CHANGED_EVENT));
    expect(await screen.findByRole("link", { name: "即将开放" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "进入工作台" })).toBeNull();
  });
});
