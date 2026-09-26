import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { readEdaJson, edaFailure } from '@/lib/server/eda-http';
import { runEdaCheck } from '@/lib/server/eda-tools';
import { consumeRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!consumeRateLimit('eda-check', user.id, 3, 60_000).allowed) return NextResponse.json({ error: '检查过于频繁，请稍后重试' }, { status: 429 });
  try {
    const input = z.object({ document: z.unknown(), kind: z.enum(['erc', 'drc']) }).parse(await readEdaJson(request));
    return NextResponse.json(await runEdaCheck(input.document, input.kind, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return edaFailure(error); }
}
