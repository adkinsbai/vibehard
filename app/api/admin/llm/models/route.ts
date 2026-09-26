import { NextResponse, type NextRequest } from "next/server";
import { llmDiscoveryInput } from "@/lib/agent/llm";
import { badRequest } from "@/lib/server/http";
import { llmAdmin, llmError } from "@/lib/server/llm-http";
import { candidateLlmCredentials } from "@/lib/server/llm-settings";
import { listProviderModels } from "@/lib/server/llm-models";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await llmAdmin(request); if (auth.response) return auth.response;
  if (!consumeRateLimit("llm-models", auth.user.id, 10, 60_000).allowed) return NextResponse.json({ error: "获取模型列表过于频繁，请稍后重试" }, { status: 429 });
  try {
    const parsed = llmDiscoveryInput.safeParse(await request.json());
    if (!parsed.success) return badRequest("请检查 Base URL 和 API Key");
    const { baseUrl, apiKey } = await candidateLlmCredentials(parsed.data);
    const models = await listProviderModels(baseUrl, apiKey, request.signal);
    return NextResponse.json({ models }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return llmError(error); }
}
