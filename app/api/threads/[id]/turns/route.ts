import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createTurn, resolveModelProfile, ThreadBusyError } from "@/lib/server/store";
import { KnowledgeRunnerUnavailable } from "@/lib/server/knowledge-dispatch";
import { badRequest, conflict, forbidden, isResourceId, requestUser, serverError, unauthorized } from "@/lib/server/http";

const schema = z.object({ input: z.string().trim().min(1).max(50_000), model: z.string().min(1), providerId: z.string().optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request); if (!user) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json()); if (!parsed.success) return badRequest("任务内容或模型无效", parsed.error.flatten().fieldErrors);
    const profile = await resolveModelProfile(parsed.data.model, parsed.data.providerId);
    if (!profile) return badRequest("模型未启用或 provider 不匹配");
    const { id } = await context.params; if (!isResourceId(id)) return badRequest("会话 ID 无效"); const turn = await createTurn(user.id, id, parsed.data.input, profile.model, profile.providerId); return turn ? NextResponse.json({ turn }, { status: 202 }) : forbidden();
  } catch (error) { return error instanceof ThreadBusyError || error instanceof KnowledgeRunnerUnavailable ? conflict(error.message) : serverError(error); }
}
