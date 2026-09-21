import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SCHEMATIC_SYSTEM, schematicModelResultSchema, schematicResultSchema } from "@/lib/agent/schematic";
import { requestUser, unauthorized } from "@/lib/server/http";
import { callLlm, LlmRequestError } from "@/lib/server/llm-client";
import { runtimeLlm } from "@/lib/server/llm-settings";
import { llmError } from "@/lib/server/llm-http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { readSchematicUpload } from "@/lib/server/schematic-upload";

export const runtime = "nodejs";
declare global { var __vibehardSchematicActive: Set<string> | undefined }
const active = globalThis.__vibehardSchematicActive ??= new Set<string>();
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (active.has(user.id) || active.size >= 2) return NextResponse.json({ error: "已有识别任务运行，请稍后重试" }, { status: 429 });
  if (!consumeRateLimit("schematic", user.id, 3, 60_000).allowed) return NextResponse.json({ error: "识别过于频繁，请稍后重试" }, { status: 429 });
  active.add(user.id);
  try {
    const config = await runtimeLlm("design");
    if (!config) throw new LlmRequestError("请管理员先配置硬件方案生成模型；原理图识别暂共用此配置，要求支持图片/PDF 输入", 503);
    const { attachment, sha256 } = await readSchematicUpload(request);
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    let cancelled = false;
    const stream = new ReadableStream({
      start(output) {
        const encoder = new TextEncoder(); let closed = false;
        const send = (value: unknown) => { if (!closed) output.enqueue(encoder.encode(JSON.stringify(value) + "\n")); };
        const close = () => { if (!closed) { closed = true; if (!cancelled) output.close(); } };
        send({ type: "status", message: "正在调用云端模型识别；结果不会自动加入知识库" });
        const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10_000);
        const abort = () => { clearInterval(heartbeat); close(); };
        signal.addEventListener("abort", abort, { once: true });
        void (async () => {
          try {
            const text = await callLlm(config, SCHEMATIC_SYSTEM, "请分析附件原理图，按要求返回含证据位置、引脚与待确认项的 JSON 草案。", signal, 90_000, attachment);
            let raw: unknown;
            try { raw = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
            catch { throw new LlmRequestError("模型返回格式不正确，未生成可提交资料；请重试"); }
            const parsed = schematicModelResultSchema.safeParse(raw);
            if (!parsed.success) throw new LlmRequestError("识别正文为空、超长或格式不完整；请拆分图纸重试");
            const generatedAt = new Date().toISOString(); const analysisId = randomUUID();
            const result = schematicResultSchema.parse({ analysisId, model: config.model, generatedAt, fileName: attachment.filename, fileSha256: sha256,
              draft: { title: parsed.data.title, kind: "schematic", source: `${attachment.filename}；SHA256 ${sha256}；识别 ${generatedAt}；模型 ${config.model}；分析编号 ${analysisId}`,
                content: `> AI 原理图识别草案，未经工程师审核或上板验证。请对照原图核验；原文件未在平台持久保存。\n\n${parsed.data.markdown}` } });
            send({ type: "result", result });
          } catch (error) { send({ type: "error", error: error instanceof LlmRequestError ? error.message : "识别失败，请检查模型是否支持图片/PDF 输入" }); }
          finally { active.delete(user.id); clearInterval(heartbeat); signal.removeEventListener("abort", abort); close(); }
        })();
      },
      cancel() { cancelled = true; controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) { active.delete(user.id); return llmError(error); }
}
