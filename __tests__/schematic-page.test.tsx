import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SchematicPage from "@/app/app/schematic/page";
import { ProjectKnowledge } from "@/components/app/project-knowledge";
import { changeKnowledge } from "@/lib/server/knowledge-state";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const projectId = "c8932037-d7f4-46ba-8ddf-31c68d831326";
const result = { analysisId: "86552575-9015-4d5c-a071-dda5c0edce1e", model: "vision", generatedAt: "2026-09-19T13:00:00.000Z", fileName: "board.png", fileSha256: "a".repeat(64), draft: { title: "原理图引脚", source: "board.png SHA256", kind: "schematic", content: "## 待确认\nU1 引脚不清晰 <script>bad()</script>" } };
const json = (data: unknown, ok = true) => ({ ok, json: async () => data });
function stream(event: unknown) { return { ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); c.close(); } }) }; }
async function analyze() {
  fireEvent.change(screen.getByLabelText("上传原理图"), { target: { files: [new File(["fixture"], "board.png", { type: "image/png" })] } });
  expect(screen.getByRole("button", { name: "开始识别" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "开始识别" }));
}
describe("schematic candidate UI", () => {
  it("requires target selection, submits only a draft, retries safely and links to that review document", async () => {
    let attempts = 0;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/projects")) return json({ projects: [{ id: projectId, name: "泰山派" }] });
      if (url.endsWith("/api/schematic")) return stream({ type: "result", result });
      if (init?.method === "POST") { if (++attempts === 1) throw new Error("网络中断"); return json({ documents: [{ id: result.analysisId }], publishedCount: 0 }); }
      throw new Error("unexpected request");
    });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<SchematicPage />);
    await analyze();
    const button = await screen.findByRole("button", { name: "申请加入知识库备选" });
    expect(button).toBeDisabled(); expect(container.querySelector("script")).toBeNull();
    fireEvent.change(screen.getByLabelText("目标项目"), { target: { value: projectId } });
    fireEvent.click(button); await screen.findByRole("alert");
    fireEvent.click(button);
    const link = await screen.findByRole("link", { name: "查看申请与审核状态 →" });
    expect(link).toHaveAttribute("href", `/app/agent/${projectId}/knowledge?document=${result.analysisId}`);
    const writes = fetcher.mock.calls.filter(([, init]) => init?.headers);
    expect(writes).toHaveLength(2);
    for (const [url, init] of writes) {
      expect(url).toContain(`/api/projects/${projectId}/knowledge`);
      expect(JSON.parse(String(init!.body))).toEqual({ action: "create", submissionId: result.analysisId, draft: result.draft });
    }
    expect(screen.queryByRole("button", { name: "审核并发布" })).toBeNull();
    expect(screen.getByRole("button", { name: "已加入备选" })).toBeDisabled();
  });
  it("does not offer candidate submission when recognition fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/api/projects") ? json({ projects: [] }) : stream({ type: "error", error: "模型服务不可用" })));
    render(<SchematicPage />); await analyze();
    expect(await screen.findByRole("alert")).toHaveTextContent("模型服务不可用");
    expect(screen.queryByRole("button", { name: "申请加入知识库备选" })).toBeNull();
  });
  it("direct status link selects the candidate without giving the submitting owner review rights", async () => {
    const docs = changeKnowledge([], { action: "create", submissionId: result.analysisId, draft: { ...result.draft, kind: "schematic" } }, crypto.randomUUID());
    vi.stubGlobal("fetch", vi.fn(async () => json({ documents: docs, projectName: "泰山派", permissions: { canEdit: true, canReview: false } })));
    render(<ProjectKnowledge projectId={projectId} initialDocumentId={result.analysisId} />);
    await waitFor(() => expect(screen.getByLabelText("资料标题")).toHaveValue("原理图引脚"));
    expect(screen.queryByRole("button", { name: "审核并发布" })).toBeNull();
    expect(docs[0].publishedVersion).toBeNull();
  });
});
