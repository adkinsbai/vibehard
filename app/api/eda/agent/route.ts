import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { readEdaJson, edaFailure } from '@/lib/server/eda-http';
import { EdaAgentError, proposeEdaEdit } from '@/lib/server/eda-agent';
import { LlmRequestError } from '@/lib/server/llm-client';
import { consumeRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!consumeRateLimit('eda-agent', user.id, 5, 60_000).allowed) return NextResponse.json({ error: '请求过于频繁，请稍后重试' }, { status: 429 });
  try {
    const input = z.object({ document: z.unknown(), prompt: z.string().trim().min(2).max(8000) }).parse(await readEdaJson(request));
    return NextResponse.json(await proposeEdaEdit(input.document, input.prompt, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EdaAgentError || error instanceof LlmRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return edaFailure(error);
  }
}
