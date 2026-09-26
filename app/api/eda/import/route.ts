import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { readEdaJson, edaFailure } from '@/lib/server/eda-http';
import { importEdaSchematic, EdaImportError } from '@/lib/server/eda-tools';
import { consumeRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!consumeRateLimit('eda-import', user.id, 5, 60_000).allowed) return NextResponse.json({ error: '导入过于频繁，请稍后重试' }, { status: 429 });
  try {
    const input = z.object({ source: z.string().min(1).max(1_000_000) }).parse(await readEdaJson(request));
    return NextResponse.json({ document: await importEdaSchematic(input.source, request.signal) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EdaImportError) return NextResponse.json({ error: error.message }, { status: 422 });
    return edaFailure(error);
  }
}
