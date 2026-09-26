import { NextResponse, type NextRequest } from "next/server";
import { sharedCategory, sharedKnowledgeInput } from "@/lib/agent/shared-knowledge";
import { badRequest, forbidden, requestUser, serverError, unauthorized } from "@/lib/server/http";
import { KnowledgeConflict, KnowledgeLimit } from "@/lib/server/knowledge-state";
import { listSharedKnowledge, mutateSharedKnowledge, SharedKnowledgeForbidden, SharedKnowledgeLimit } from "@/lib/server/shared-knowledge-store";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const noStore = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const category = request.nextUrl.searchParams.get("category");
  const parsed = category ? sharedCategory.safeParse(category) : null;
  if (parsed && !parsed.success) return badRequest("未知资料分类");
  try { return NextResponse.json({ entries: await listSharedKnowledge(user.id, parsed?.data), viewerId: user.id }, { headers: noStore }); }
  catch (error) { return error instanceof SharedKnowledgeForbidden ? forbidden("仅管理员和开发者可以管理平台知识库") : serverError(error); }
}

export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!consumeRateLimit("shared-knowledge", user.id, 10, 60_000).allowed) return NextResponse.json({ error: "操作过于频繁，请稍后重试" }, { status: 429 });
  const reader = request.body?.getReader(); if (!reader) return badRequest("缺少资料内容");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 64_000) { await reader.cancel(); return NextResponse.json({ error: "单次提交不能超过 64 KB" }, { status: 413 }); }
    chunks.push(value);
  }
  let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return badRequest("资料格式不是有效 JSON"); }
  const parsed = sharedKnowledgeInput.safeParse(body);
  if (!parsed.success) return badRequest("请填写资料分类、标题、来源和最多 6000 字正文");
  try { return NextResponse.json({ entry: await mutateSharedKnowledge(user.id, parsed.data.category, parsed.data.mutation) }, { headers: noStore }); }
  catch (error) {
    if (error instanceof SharedKnowledgeForbidden) return forbidden("仅管理员和开发者可操作；草稿只能由提交者修改");
    if (error instanceof KnowledgeConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof KnowledgeLimit || error instanceof SharedKnowledgeLimit) return badRequest(error.message);
    return serverError(error);
  }
}
