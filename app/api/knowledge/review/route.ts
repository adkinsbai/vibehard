import { NextResponse, type NextRequest } from "next/server";
import { forbidden, requestUser, unauthorized, badRequest, isResourceId, serverError } from "@/lib/server/http";
import { listKnowledgeReviewProjects } from "@/lib/server/knowledge-store";

export async function GET(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  const after = request.nextUrl.searchParams.get("after") ?? undefined;
  if (after && !isResourceId(after)) return badRequest("分页参数无效");
  try {
    const result = await listKnowledgeReviewProjects(user.id, after);
    return result ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } }) : forbidden("仅管理员和开发者可以审核知识库");
  } catch (error) { return serverError(error); }
}
