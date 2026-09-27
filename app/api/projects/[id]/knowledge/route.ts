import { NextResponse, type NextRequest } from "next/server";
import { knowledgeActionSchema } from "@/lib/agent/knowledge";
import { getProjectKnowledge, getProjectKnowledgeView, KnowledgeForbidden, updateProjectKnowledge } from "@/lib/server/knowledge-store";
import { KnowledgeConflict, KnowledgeLimit, publishedSnapshot } from "@/lib/server/knowledge-state";
import { badRequest, conflict, forbidden, isResourceId, requestUser, serverError, unauthorized } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };
const result = (documents: NonNullable<Awaited<ReturnType<typeof getProjectKnowledge>>>) => NextResponse.json({ documents, publishedCount: publishedSnapshot(documents).documents.length }, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest, context: Context) {
  const user = await requestUser(request); if (!user) return unauthorized();
  try {
    const { id } = await context.params; if (!isResourceId(id)) return badRequest("项目 ID 无效");
    const view = await getProjectKnowledgeView(user.id, id);
    return view ? NextResponse.json({ ...view, publishedCount: publishedSnapshot(view.documents).documents.length }, { headers: { "Cache-Control": "no-store" } }) : forbidden();
  } catch (error) { return serverError(error); }
}
export async function POST(request: NextRequest, context: Context) {
  const user = await requestUser(request); if (!user) return unauthorized();
  try {
    const { id } = await context.params; if (!isResourceId(id)) return badRequest("项目 ID 无效");
    // Bound the streamed JSON body even when Content-Length is absent or false.
    const reader = request.body?.getReader(); if (!reader) return badRequest("缺少资料内容");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 64_000) { await reader.cancel(); return NextResponse.json({ error: "单次提交不能超过 64 KB" }, { status: 413 }); }
      chunks.push(value);
    }
    let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return badRequest("资料格式不是有效 JSON"); }
    const parsed = knowledgeActionSchema.safeParse(body);
    if (!parsed.success) return badRequest("请填写标题、来源和正文；发布须明确确认，正文最多 6000 字");
    const documents = await updateProjectKnowledge(user.id, id, parsed.data);
    return documents ? result(documents) : forbidden();
  } catch (error) {
    if (error instanceof KnowledgeForbidden) return forbidden(error.message);
    if (error instanceof KnowledgeConflict) return conflict(error.message);
    if (error instanceof KnowledgeLimit) return badRequest(error.message);
    return serverError(error);
  }
}
