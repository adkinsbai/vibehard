import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestUser, isResourceId, badRequest, unauthorized } from "@/lib/server/http";
import { ownedProject } from "@/lib/server/store";
import { latestProjectBom, projectBomCsv } from "@/lib/server/project-bom";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!isResourceId(id)) return badRequest("项目 ID 无效");
  const format = request.nextUrl.searchParams.get("format");
  if (format && format !== "csv") return badRequest("导出格式无效");
  const designId = request.nextUrl.searchParams.get("designId");
  if (designId !== null && !isResourceId(designId)) return badRequest("方案 ID 无效");
  try {
    if (!await ownedProject(user.id, id)) return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
    const bom = await latestProjectBom(user.id, id, designId ?? undefined);
    if (format === "csv") {
      if (!bom) return NextResponse.json({ error: "该项目尚无已完成方案 BOM" }, { status: 409 });
      return new Response(projectBomCsv(bom), { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vibehard-bom-${id}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    return NextResponse.json({ bom }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "项目 BOM 暂时无法读取，请稍后重试" }, { status: 503 });
  }
}
