import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LlmSettings } from "@/components/app/llm-settings";

const setting = { purpose: "design", baseUrl: "https://api.example.com", model: "old-model", protocol: "responses", hasApiKey: true,
  revision: "00000000-0000-4000-8000-000000000001", updatedAt: "2026-09-25T00:00:00.000Z" };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("discovers and searches provider models, then saves only the selected ID", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/admin/llm/models")) return Response.json({ models: [
      { id: "deepseek-flash", name: "DeepSeek Flash" }, { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    ] });
    if (init?.method === "PUT") return Response.json({ setting: { ...setting, model: JSON.parse(String(init.body)).model } });
    return Response.json({ settings: [setting] });
  });
  vi.stubGlobal("fetch", fetcher);
  const onSaved = vi.fn();
  const user = userEvent.setup(); render(<LlmSettings onSaved={onSaved} />);
  await screen.findByDisplayValue("old-model");
  await user.click(screen.getByRole("button", { name: "获取模型列表" }));
  expect(await screen.findByRole("combobox", { name: "硬件方案生成 选择模型" })).toHaveValue("");
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/api/admin/llm/models"))).toHaveLength(1);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  await user.type(screen.getByRole("textbox", { name: "硬件方案生成 搜索模型" }), "V4");
  await user.selectOptions(screen.getByRole("combobox", { name: "硬件方案生成 选择模型" }), "deepseek-v4-pro");
  await user.click(screen.getByRole("button", { name: "保存配置" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  const save = fetcher.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(JSON.parse(String(save[1]?.body))).toMatchObject({ purpose: "design", model: "deepseek-v4-pro", baseUrl: setting.baseUrl });
  expect(screen.getByText(/已保存。后续请求使用此配置/)).toBeInTheDocument();
  expect(onSaved).toHaveBeenCalledOnce();
});

it("uses an entered key for a new address and retains manual fallback when listing fails", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/admin/llm/models")) return Response.json({ error: "服务商未提供模型列表" }, { status: 502 });
    if (init?.method === "PUT") return Response.json({ setting });
    return Response.json({ settings: [setting] });
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup(); render(<LlmSettings />);
  const url = await screen.findByRole("textbox", { name: "硬件方案生成 Base URL" });
  await user.clear(url); await user.type(url, "https://new.example.com/v1");
  expect(screen.getByRole("textbox", { name: "硬件方案生成 模型 ID" })).toHaveValue("");
  await user.type(screen.getByLabelText("硬件方案生成 API Key"), "new-test-key");
  await user.click(screen.getByRole("button", { name: "获取模型列表" }));
  expect(await screen.findByText(/服务商未提供模型列表；可手动输入模型 ID/)).toBeInTheDocument();
  const call = fetcher.mock.calls.find(([path]) => String(path).endsWith("/api/admin/llm/models"))!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ baseUrl: "https://new.example.com/v1", apiKey: "new-test-key" });
  expect(screen.getByRole("textbox", { name: "硬件方案生成 模型 ID" })).toBeEnabled();
});
