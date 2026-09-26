import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardLibrary } from "@/components/app/board-library";
import { CatalogNavLink } from "@/components/app/catalog-nav-link";
import { catalogFacets, filterBoards, canReadBoardCatalog } from "@/lib/board-catalog";
import boards from "@/lib/server/data/board-catalog.json";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/knowledge" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("board catalog data and filters", () => {
  it("preserves the complete catalog without presenting original download claims", () => {
    expect(boards).toHaveLength(63);
    expect(new Set(boards.map(board => board.name)).size).toBe(63);
    const facets = catalogFacets(boards);
    expect(facets.categories).toHaveLength(12);
    expect(facets.features).toHaveLength(18);
    const resources = boards.flatMap(board => board.resources);
    expect(resources).toHaveLength(1076);
    expect(resources.filter(resource => resource.path)).toHaveLength(808);
    expect(JSON.stringify(boards)).not.toContain("已下载");
  });
  it("combines case-insensitive search, category and all requested features", () => {
    expect(filterBoards(boards, "  esp32-s3-a7670e  ", "4G通信", ["4G Cat-1", "SD 卡槽"])).toHaveLength(1);
    expect(filterBoards(boards, "ESP32", "4G通信", ["LoRa"])).toHaveLength(0);
    expect(filterBoards(boards, "", "", [])).toHaveLength(63);
  });
});

describe("board library UI", () => {
  it("filters by query, category and features, and resets the empty state", () => {
    render(<BoardLibrary boards={boards} />);
    expect(screen.getByRole("status")).toHaveTextContent("63 款板卡");
    fireEvent.click(screen.getByRole("button", { name: /4G通信\s*2/ }));
    expect(screen.getByRole("status")).toHaveTextContent("2 款板卡");
    fireEvent.change(screen.getByRole("textbox", { name: "搜索板卡" }), { target: { value: "a7670e" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 款板卡");
    fireEvent.click(screen.getByRole("button", { name: "LoRa" }));
    expect(screen.getByText("没有符合条件的板卡")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(screen.getByRole("status")).toHaveTextContent("63 款板卡");
  });
  it("opens grouped resources, does not offer fake downloads, and restores focus on Escape", async () => {
    const user = userEvent.setup(); render(<BoardLibrary boards={boards} />);
    const trigger = screen.getByRole("button", { name: `查看 ${boards[0].name}` });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: boards[0].name });
    expect(within(dialog).getByText("1. 硬件资料")).toBeVisible();
    expect(within(dialog).getByText(`参考路径：${boards[0].resources[0].path}`)).toBeVisible();
    expect(within(dialog).queryByText("待补充")).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(dialog).not.toHaveTextContent("已下载");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("handles a board with no resources and missing metadata", async () => {
    const board = { name: "待补充板卡", category: "无屏主控板", size: "", features: [], resources: [] };
    render(<BoardLibrary boards={[board]} />);
    fireEvent.click(screen.getByRole("button", { name: "查看 待补充板卡" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("还没有资料目录");
    expect(dialog).toHaveTextContent("原始尺寸：未提供");
  });
  it("compares up to four boards and retains/removes selections across filters", async () => {
    const user = userEvent.setup(); render(<BoardLibrary boards={boards} />);
    await user.click(screen.getByRole("checkbox", { name: `对比 ${boards[0].name}` }));
    expect(screen.getByRole("button", { name: "开始对比" })).toBeDisabled();
    for (const board of boards.slice(1, 4)) await user.click(screen.getByRole("checkbox", { name: `对比 ${board.name}` }));
    expect(screen.getByRole("checkbox", { name: `对比 ${boards[4].name}` })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索板卡" }), { target: { value: "nothing-found" } });
    await user.click(screen.getByRole("button", { name: "开始对比" }));
    const dialog = await screen.findByRole("dialog", { name: "板卡参数对比" });
    expect(within(dialog).getAllByRole("columnheader")).toHaveLength(5);
    expect(dialog).toHaveTextContent("资料目录");
    expect(dialog).not.toHaveTextContent("待补充");
    await user.click(within(dialog).getByRole("button", { name: "关闭弹窗" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: `移除 ${boards[0].name}` }));
    expect(screen.getByText("已选 3 / 4 款板卡")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.queryByRole("button", { name: "开始对比" })).toBeNull();
  });
  it("shows complete-catalog statistics and keeps filters when returning", () => {
    render(<BoardLibrary boards={boards} />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索板卡" }), { target: { value: "a7670e" } });
    fireEvent.click(screen.getByRole("button", { name: "数据看板" }));
    expect(screen.getByText("开发板型号")).toBeVisible();
    expect(screen.getByText("资料目录条目")).toBeVisible();
    expect(screen.queryByText(/已上传|待补充/)).toBeNull();
    expect(screen.getByRole("heading", { name: "板卡分类分布" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "产品库" }));
    expect(screen.getByRole("textbox", { name: "搜索板卡" })).toHaveValue("a7670e");
    expect(screen.getByRole("status")).toHaveTextContent("1 款板卡");
  });
});

describe("restricted catalog navigation", () => {
  it.each(["admin", "developer", "member", "ADMIN", "unknown"])("only shows authorized navigation for %s", async role => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: true, user: { role } }) }));
    vi.stubGlobal("fetch", fetcher);
    render(<CatalogNavLink />);
    if (canReadBoardCatalog(role)) expect(await screen.findByRole("link", { name: "知识库" })).toHaveAttribute("href", "/app/knowledge");
    else { await waitFor(() => expect(fetcher).toHaveBeenCalled()); expect(screen.queryByRole("link")).toBeNull(); }
  });
  it("removes navigation after logout/role revocation and fails closed on session failure", async () => {
    let allowed = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: allowed, json: async () => ({ authenticated: true, user: { role: "admin" } }) })));
    render(<CatalogNavLink mobile />);
    await screen.findByRole("link", { name: "知识库" });
    allowed = false;
    fireEvent(window, new Event(AUTH_CHANGED_EVENT));
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });
});
