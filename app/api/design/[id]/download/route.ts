import { NextResponse, type NextRequest } from "next/server";
import { getDesign } from "@/lib/server/design-job-store";
import { designMarkdown } from "@/lib/agent/design-jobs";
import { badRequest, isResourceId, requestUser, unauthorized } from "@/lib/server/http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const { id } = await context.params; if (!isResourceId(id)) return badRequest("方案编号无效");
  try {
    const job = await getDesign(user.id, id);
    if (!job) return NextResponse.json({ error: "方案不存在或无权访问" }, { status: 404 });
    if (job.status !== "completed" || !job.result) return NextResponse.json({ error: "方案尚未生成" }, { status: 409 });
    return new Response(designMarkdown(job), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="hardware-design-${id}.md"` } });
  } catch { return NextResponse.json({ error: "方案下载暂时不可用" }, { status: 503 }); }
}
