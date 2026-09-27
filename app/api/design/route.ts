import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { designJobInput } from "@/lib/agent/design-jobs";
import { DesignJobError, enqueueDesign, listDesigns } from "@/lib/server/design-job-store";
import { badRequest, isResourceId, requestUser, unauthorized } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if ((projectId && !isResourceId(projectId)) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return badRequest("查询参数不正确");
  if (!db) return NextResponse.json({ error: "方案持久化数据库未配置" }, { status: 503 });
  try { return NextResponse.json(await listDesigns(user.id, projectId, offset), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "方案记录暂时无法读取，请稍后重试" }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const parsed = designJobInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("请输入 2–12000 字需求及有效的提交编号");
  if (!db) return NextResponse.json({ error: "方案持久化数据库未配置，尚未创建项目或提交任务" }, { status: 503 });
  if (!consumeRateLimit("design", user.id, 10, 60_000).allowed) return NextResponse.json({ error: "提交过于频繁，请稍后重试" }, { status: 429 });
  try { return NextResponse.json({ job: await enqueueDesign(user.id, parsed.data) }, { status: 202 }); }
  catch (error) {
    return NextResponse.json({ error: error instanceof DesignJobError ? error.message : "暂时无法确认任务是否保存，请使用相同提交重试" }, { status: error instanceof DesignJobError ? error.status : 503 });
  }
}
