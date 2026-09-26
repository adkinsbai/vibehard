import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeLibrary } from "@/components/app/knowledge-library";
import { knowledgeCategories, knowledgeEntries, resourceCategory } from "@/lib/knowledge-catalog";
import boards from "@/lib/server/data/board-catalog.json";

afterEach(cleanup);
describe("unified knowledge library", () => {
  it("has six categories, a single knowledge heading and no pending-file status labels", () => {
    render(<KnowledgeLibrary boards={boards} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^知识库$/);
    for (const category of knowledgeCategories) expect(screen.getByRole("button", { name: category.title })).toBeVisible();
    expect(screen.queryByText(/待补充|已上传|资料准备中|板卡知识库/)).toBeNull();
  });
  it("groups real references and does not mistake PCBA 3D files for PCB design documents", () => {
    expect(resourceCategory({ name: "3D 图纸", path: "board-pcba.zip", section: "硬件资料" })).toBeNull();
    expect(resourceCategory({ name: "PCB 工程", path: "board.kicad_pcb", section: "硬件资料" })).toBe("pcb");
    const entries = knowledgeEntries(boards);
    expect(entries.some(entry => entry.category === "manuals")).toBe(true);
    expect(entries.some(entry => entry.category === "schematics")).toBe(true);
    expect(entries.some(entry => entry.category === "firmware")).toBe(true);
    expect(entries.some(entry => entry.category === "experience")).toBe(false);
  });
  it("searches schematic references and opens metadata without a fake download", async () => {
    render(<KnowledgeLibrary boards={boards} />);
    fireEvent.click(screen.getByRole("button", { name: "原理图库" }));
    fireEvent.change(screen.getByRole("textbox", { name: "搜索原理图库" }), { target: { value: "A7670E" } });
    const section = screen.getByRole("region", { name: "原理图库目录" });
    expect(within(section).getByRole("status")).toHaveTextContent("2 条目录记录");
    fireEvent.click(within(section).getByRole("button", { name: /^原理图 ESP32/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("ESP32-S3-A7670E-4G");
    expect(dialog).toHaveTextContent("参考路径");
    expect(dialog).not.toHaveTextContent("待补充");
    expect(within(dialog).queryByRole("link")).toBeNull();
  });
  it("limits initial manual rendering, loads more and distinguishes search misses from empty categories", () => {
    render(<KnowledgeLibrary boards={boards} />);
    fireEvent.click(screen.getByRole("button", { name: "芯片手册" }));
    const section = screen.getByRole("region", { name: "芯片手册目录" });
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: /加载更多/ }));
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(48);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索芯片手册" }), { target: { value: "not-an-existing-reference" } });
    expect(screen.getByText("没有找到匹配的资料")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "开发经验" }));
    expect(screen.getByText("暂无目录记录")).toBeVisible();
    expect(screen.queryByText(/待补充|已上传/)).toBeNull();
  });
  it("preserves board filters while browsing another knowledge category", () => {
    render(<KnowledgeLibrary boards={boards} />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索板卡" }), { target: { value: "a7670e" } });
    fireEvent.click(screen.getByRole("button", { name: "PCB 库" }));
    expect(screen.queryByRole("textbox", { name: "搜索板卡" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "开发板选型库" }));
    expect(screen.getByRole("textbox", { name: "搜索板卡" })).toHaveValue("a7670e");
    expect(screen.getByRole("status")).toHaveTextContent("1 款板卡");
  });
});
