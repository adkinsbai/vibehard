import { NextResponse, type NextRequest } from "next/server";
import { getDesign } from "@/lib/server/design-job-store";
import { badRequest, isResourceId, requestUser, unauthorized } from "@/lib/server/http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const { id } = await context.params; if (!isResourceId(id)) return badRequest("方案编号无效");
  try {
    const job = await getDesign(user.id, id);
    return NextResponse.json(job ? { job } : { error: "方案不存在或无权访问" }, { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "方案暂时无法读取" }, { status: 503 }); }
}
