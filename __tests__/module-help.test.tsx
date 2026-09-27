import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bot } from "lucide-react";
import { ModuleHelp } from "@/components/app/module-help";
import { PageHeader } from "@/components/app/page-header";
import { moduleHelp, type ModuleHelpKey } from "@/lib/module-help";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("module usage help", () => {
  it.each(Object.keys(moduleHelp) as ModuleHelpKey[])("opens the correct guide for %s and closes without a request", async module => {
    const user = userEvent.setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<ModuleHelp module={module} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: `${moduleHelp[module].title}使用说明` }));
    const dialog = await screen.findByRole("dialog", { name: `${moduleHelp[module].title} · 使用说明` });
    expect(dialog).toHaveAccessibleDescription(moduleHelp[module].purpose);
    for (const text of [...moduleHelp[module].steps, ...moduleHelp[module].notes]) expect(within(dialog).getByText(text)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "关闭使用说明" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("supports keyboard opening, trapped focus, Escape and focus return without losing form input", async () => {
    const user = userEvent.setup();
    render(<><ModuleHelp module="agent" /><textarea aria-label="任务" defaultValue="我的未提交任务" /></>);
    const trigger = screen.getByRole("button", { name: "Agent 项目使用说明" });
    await user.tab(); expect(trigger).toHaveFocus(); await user.keyboard("{Enter}");
    const close = await screen.findByRole("button", { name: "关闭使用说明" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab(); await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "任务" })).toHaveValue("我的未提交任务");
  });
  it("dismisses on a backdrop press and keeps help next to the page heading", async () => {
    const user = userEvent.setup();
    render(<PageHeader icon={Bot} title="Agent 项目" description="项目说明" helpKey="agent" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Agent 项目");
    await user.click(screen.getByRole("button", { name: "Agent 项目使用说明" }));
    await screen.findByRole("dialog");
    await user.click(document.querySelector('[data-slot="module-help-backdrop"]')!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
