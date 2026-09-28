import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BomPage from "@/app/app/bom/page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("BomPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("没有工程时不显示 BOM 表格", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), { status: 200 }),
    ));

    render(<BomPage />);

    expect(await screen.findByText("暂无工程，暂时没有 BOM")).toBeInTheDocument();
    expect(screen.queryByText("候选型号")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /去创建工程/ })).toHaveAttribute("href", "/app/agent");
  });

  it("有已完成方案时显示后端 BOM 并提供真实 CSV 下载入口", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/api/projects")
        ? new Response(JSON.stringify({ projects: [{ id: "p1", name: "测试工程" }] }), { status: 200 })
        : new Response(JSON.stringify({ bom: { projectId: "p1", projectName: "测试工程", designId: "d1", completedAt: "2026-09-28T00:00:00.000Z", model: "test-model", items: [{ item: "真实器件", model: "MCU-1", qty: 2, estCost: "¥5（估算）" }] } }), { status: 200 }),
    )));

    render(<BomPage />);

    expect(await screen.findByText("当前工程 BOM")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "选择工程" })).toHaveValue("p1");
    expect(await screen.findByText("真实器件")).toBeInTheDocument();
    expect(screen.getByText("MCU-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /下载真实 BOM.csv/ })).toHaveAttribute("href", "/api/projects/p1/bom?format=csv&designId=d1");
    expect(screen.queryByText("库存")).not.toBeInTheDocument();
    expect(screen.queryByText("立创一键下单")).not.toBeInTheDocument();
  });

  it("有工程但没有完成方案时不展示示例器件或虚假导出", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/api/projects")
        ? new Response(JSON.stringify({ projects: [{ id: "p1", name: "测试工程" }] }), { status: 200 })
        : new Response(JSON.stringify({ bom: null }), { status: 200 }),
    )));
    render(<BomPage />);
    expect(await screen.findByText(/此工程尚无已完成的方案 BOM/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /BOM.csv/ })).not.toBeInTheDocument();
    expect(screen.queryByText("ESP32-S3-WROOM-1-N8R2")).not.toBeInTheDocument();
  });
});
