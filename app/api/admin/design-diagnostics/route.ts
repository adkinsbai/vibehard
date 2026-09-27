import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { forbidden, requestUser, serverError, unauthorized } from "@/lib/server/http";
import { listDesignDiagnostics } from "@/lib/server/design-job-store";

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden("仅管理员可以查看任务诊断");
  try { return NextResponse.json({ jobs: await listDesignDiagnostics() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return serverError(error); }
}
