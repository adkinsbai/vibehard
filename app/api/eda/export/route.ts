import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { readEdaJson, edaFailure } from '@/lib/server/eda-http';
import { createEdaArchive, EdaExportError } from '@/lib/server/eda-export';
import { consumeRateLimit } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!consumeRateLimit('eda-export', user.id, 2, 60_000).allowed) return NextResponse.json({ error: '导出过于频繁，请稍后重试' }, { status: 429 });
  try {
    const input = z.object({ document: z.unknown() }).parse(await readEdaJson(request));
    const archive = await createEdaArchive(input.document, request.signal);
    return new NextResponse(new Uint8Array(archive).buffer, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="vibehard-engineering.zip"', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EdaExportError) return NextResponse.json({ error: error.message }, { status: 422 });
    return edaFailure(error);
  }
}
