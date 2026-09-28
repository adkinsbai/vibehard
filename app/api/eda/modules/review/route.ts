import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isKnowledgeReviewer } from '@/lib/agent/knowledge';
import { readEdaJson } from '@/lib/server/eda-http';
import { forbidden, requestUser, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { EdaModuleCatalogError, moduleMutationSameOrigin, nativeModuleReviewQueue, reviewNativeModule } from '@/lib/server/eda-module-catalog';

export const runtime = 'nodejs';
const reviewSchema = z.strictObject({ id: z.uuid(), reviewReference: z.string().trim().min(1).max(200) });

export async function GET(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!isKnowledgeReviewer(user.role)) return forbidden('仅管理员或开发者可以查看待审核模块');
  const id = request.nextUrl.searchParams.get('id');
  if (id && !z.uuid().safeParse(id).success) return NextResponse.json({ error: '模块版本 ID 无效' }, { status: 400 });
  try { return NextResponse.json(await nativeModuleReviewQueue(user.id, id ?? undefined), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof EdaModuleCatalogError ? error.message : '待审核模块暂时不可用' }, { status: error instanceof EdaModuleCatalogError ? error.status : 503 }); }
}

export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!isKnowledgeReviewer(user.role)) return forbidden('仅管理员或开发者可以审核模块');
  if (!moduleMutationSameOrigin(request)) return forbidden('请求来源不匹配');
  if (!consumeRateLimit('eda-module-review', user.id, 10, 60_000).allowed) return NextResponse.json({ error: '审核请求过于频繁' }, { status: 429 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: '仅接受 JSON 审核请求' }, { status: 415 });
  try {
    const body = reviewSchema.parse(await readEdaJson(request));
    return NextResponse.json({ module: await reviewNativeModule(user.id, body.id, body.reviewReference) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EdaModuleCatalogError ? error.message : '模块审核请求无效' }, {
      status: error instanceof EdaModuleCatalogError ? error.status : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
