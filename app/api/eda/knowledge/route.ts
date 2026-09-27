import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { EdaKnowledgeError, searchEdaKnowledge } from '@/lib/server/eda-knowledge';

export const runtime = 'nodejs';

/** Read-only, authenticated query over a pinned OSS knowledge snapshot. */
export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return unauthorized();
  if (!consumeRateLimit('eda-knowledge', user.id, 20, 60_000).allowed) return NextResponse.json({ error: '查询过于频繁，请稍后重试' }, { status: 429 });
  const parsed = z.string().trim().min(2).max(240).safeParse(request.nextUrl.searchParams.get('q'));
  if (!parsed.success) return NextResponse.json({ error: '查询文字需为 2 到 240 个字符' }, { status: 400 });
  try {
    const result = await searchEdaKnowledge(parsed.data, 5);
    if (!result) return NextResponse.json({ error: 'EDA 资料库尚未启用' }, { status: 503 });
    return NextResponse.json({ ...result, usage: 'reference_only_not_hardware_approved' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EdaKnowledgeError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'EDA 资料库查询失败' }, { status: 503 });
  }
}
