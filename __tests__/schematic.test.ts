// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/schematic/route";
import { POST as submit, GET as knowledge } from "@/app/api/projects/[id]/knowledge/route";
import { callLlm, llmRequestBody, LlmRequestError } from "@/lib/server/llm-client";
import { readSchematicUpload } from "@/lib/server/schematic-upload";
import { createProject, createUser } from "@/lib/server/store";
import { createSessionToken } from "@/lib/server/security";
import { saveLlm } from "@/lib/server/llm-settings";
import { schematicResultSchema, SCHEMATIC_FILE_LIMIT } from "@/lib/agent/schematic";
import { changeKnowledge, publishedSnapshot } from "@/lib/server/knowledge-state";
import type { RuntimeLlm } from "@/lib/agent/llm";

vi.mock("@/lib/server/llm-client", async original => ({ ...await original<typeof import("@/lib/server/llm-client")>(), callLlm: vi.fn(), providerAddress: vi.fn().mockResolvedValue({ address: "8.8.8.8", family: 4 }) }));
const pdf = new File(["%PDF-1.4\nsynthetic transport fixture"], "board.pdf", { type: "application/pdf" });
const modelReply = JSON.stringify({ title: "板卡资料", markdown: "## 引脚与证据\n第 1 页 U1 引脚文字无法辨认。\n## 待确认项\n需清晰原图，不声称已验证。" });
beforeEach(() => { globalThis.__vibehardLlmSettings?.clear(); globalThis.__vibehardSchematicActive?.clear(); vi.mocked(callLlm).mockReset(); });
async function fixture(configured = true) {
  const user = await createUser({ email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "test", inviteCode: "test" });
  if (configured) await saveLlm({ purpose: "design", baseUrl: "https://example.com/v1", model: "vision-test", protocol: "responses", apiKey: "test-api-key", revision: null }, user.id);
  return { user, cookie: `vibehard_session=${createSessionToken(user)}` };
}
function upload(cookie = "", file = pdf) {
  const form = new FormData(); form.set("file", file);
  return new NextRequest("https://example.com/api/schematic", { method: "POST", headers: { Cookie: cookie }, body: form });
}
describe("schematic upload and protocol", () => {
  it("sends actual PDF/image bytes with the configured protocol and leaves text-only calls unchanged", () => {
    const config: RuntimeLlm = { model: "existing-model", protocol: "responses", baseUrl: "https://example.com/v1", apiKey: "secret", revision: "r" };
    const file = { filename: "board.pdf", mimeType: "application/pdf" as const, base64: "JVBERi0=" };
    expect(llmRequestBody(config, "rules", "task", file)).toMatchObject({ model: "existing-model", store: false, input: [{ content: [{ text: "task" }, { type: "input_file", filename: "board.pdf", file_data: "data:application/pdf;base64,JVBERi0=" }] }] });
    expect(llmRequestBody({ ...config, protocol: "chat-completions" }, "rules", "task", file)).toMatchObject({ messages: [{ content: "rules" }, { content: [{ text: "task" }, { type: "file", file: { filename: "board.pdf" } }] }] });
    const image = { ...file, filename: "board.png", mimeType: "image/png" as const };
    expect(JSON.stringify(llmRequestBody(config, "rules", "task", image))).toContain('"type":"input_image"');
    expect(JSON.stringify(llmRequestBody({ ...config, protocol: "chat-completions" }, "rules", "task", image))).toContain('"type":"image_url"');
    expect(llmRequestBody(config, "rules", "task")).toMatchObject({ input: "task" });
  });
  it("bounds streamed upload bytes and rejects incorrect extensions/signatures", async () => {
    const valid = await readSchematicUpload(upload());
    expect(valid.attachment.base64).toBe(Buffer.from(await pdf.arrayBuffer()).toString("base64"));
    expect(valid.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(readSchematicUpload(upload("", new File(["not an image"], "a.png", { type: "image/png" })))).rejects.toThrow("一致");
    await expect(readSchematicUpload(upload("", new File(["%PDF-1.4"], "a.png", { type: "image/png" })))).rejects.toThrow("一致");
    const bytes = new Uint8Array(SCHEMATIC_FILE_LIMIT + 40_000);
    const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: bytes });
    await expect(readSchematicUpload(request)).rejects.toThrow("5 MB");
  });
});
describe("real schematic route contracts (upstream mocked)", () => {
  it("requires authentication/config and returns no fixed circuit fallback", async () => {
    expect((await POST(upload())).status).toBe(401);
    const { cookie } = await fixture(false);
    expect((await POST(upload(cookie))).status).toBe(503);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("produces provenance and saves only an owner-scoped pending draft, with idempotent retries", async () => {
    const { user, cookie } = await fixture();
    vi.mocked(callLlm).mockResolvedValue(modelReply);
    const stream = await (await POST(upload(cookie))).text();
    const event = stream.trim().split("\n").map(line => JSON.parse(line)).find(event => event.type === "result");
    const result = schematicResultSchema.parse(event.result);
    expect(result.draft.source).toContain(result.fileSha256);
    expect(result.draft.content).toContain("未经工程师审核");
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ model: "vision-test" }), expect.stringContaining("不使用固定示例"), expect.any(String), expect.any(AbortSignal), 90_000, expect.objectContaining({ filename: "board.pdf", mimeType: "application/pdf", base64: Buffer.from(await pdf.arrayBuffer()).toString("base64") }));
    const project = await createProject(user.id, { name: "原理图申请", workspaceKey: crypto.randomUUID() });
    const context = { params: Promise.resolve({ id: project.id }) };
    const action = { action: "create", submissionId: result.analysisId, draft: result.draft };
    const request = () => new NextRequest("http://localhost/api/knowledge", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const saved = await (await submit(request(), context)).json();
    expect(saved.documents).toHaveLength(1); expect(saved.publishedCount).toBe(0);
    expect((await (await submit(request(), context)).json()).documents).toHaveLength(1);
    const outsider = await fixture(false);
    expect((await knowledge(new NextRequest("http://localhost", { headers: { Cookie: outsider.cookie } }), context)).status).toBe(403);
    const foreign = new NextRequest("http://localhost/api/knowledge", { method: "POST", headers: { Cookie: outsider.cookie, "Content-Type": "application/json" }, body: JSON.stringify(action) });
    expect((await submit(foreign, context)).status).toBe(403);
  });
  it("does not overwrite subsequent edits/publications when a submission is retried", () => {
    const owner = crypto.randomUUID();
    const action = { action: "create" as const, submissionId: crypto.randomUUID(), draft: { title: "pins", content: "U1 待确认", source: "board.pdf", kind: "schematic" as const } };
    let docs = changeKnowledge([], action, owner);
    docs = changeKnowledge(docs, { action: "edit", documentId: docs[0].id, expectedRevision: docs[0].revision, draft: { ...action.draft, content: "engineer correction" } }, owner);
    docs = changeKnowledge(docs, { action: "publish", documentId: docs[0].id, expectedRevision: docs[0].revision, confirmed: true }, owner);
    expect(changeKnowledge(docs, action, owner)).toEqual(docs);
    expect(publishedSnapshot(docs).documents[0].content).toBe("engineer correction");
    expect(() => changeKnowledge(docs, { ...action, draft: { ...action.draft, content: "different" } }, owner)).toThrow("申请编号");
  });
  it("surfaces upstream failures, invalid output, and unsupported files without a result", async () => {
    const { cookie } = await fixture();
    vi.mocked(callLlm).mockRejectedValue(new LlmRequestError("模型不支持图片"));
    let text = await (await POST(upload(cookie))).text();
    expect(text).toContain("模型不支持图片"); expect(text).not.toContain('"type":"result"');
    vi.mocked(callLlm).mockResolvedValue("not JSON");
    text = await (await POST(upload(cookie))).text();
    expect(text).toContain("格式不正确"); expect(text).not.toContain('"type":"result"');
    expect((await POST(upload(cookie, new File(["<svg/>"], "bad.svg")))).status).toBe(400);
    expect(globalThis.__vibehardSchematicActive?.size).toBe(0);
  });
  it("rejects concurrent work and releases the slot on cancellation", async () => {
    const { cookie } = await fixture();
    vi.mocked(callLlm).mockImplementation((_c, _s, _p, signal) => new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new LlmRequestError("取消")), { once: true })));
    const response = await POST(upload(cookie));
    expect((await POST(upload(cookie))).status).toBe(429);
    await response.body!.cancel();
    await vi.waitFor(() => expect(globalThis.__vibehardSchematicActive?.size).toBe(0));
  });
});
