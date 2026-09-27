import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TaishanPage from "@/app/app/taishan/page";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it("integrates the module guide while preserving the independent platform URL", async () => {
  render(<TaishanPage />);
  expect(screen.getByTitle("泰山派开发平台")).toHaveAttribute("src", "/Vibeboard/");
  expect(screen.getByRole("link", { name: "在新窗口打开" })).toHaveAttribute("href", "/Vibeboard/");
  expect(screen.getByText(/应用生成、校验与设备部署以该系统的实际结果为准/)).toBeVisible();
  expect(screen.getByText(/项目和知识数据暂不与 VibeHard 自动同步/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "泰山派开发使用说明" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("不自动同步 VibeHard 的 Agent 项目");
});
it("offers a timeout fallback and replaces the iframe when reloading", () => {
  vi.useFakeTimers(); render(<TaishanPage />);
  const first = screen.getByTitle("泰山派开发平台");
  act(() => { vi.advanceTimersByTime(15001); });
  expect(screen.getByText("开发平台还没有加载出来")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(screen.getByTitle("泰山派开发平台")).not.toBe(first);
  expect(screen.getByText("正在加载开发平台…")).toBeInTheDocument();
  fireEvent.load(screen.getByTitle("泰山派开发平台"));
  expect(screen.queryByText("正在加载开发平台…")).toBeNull();
});
