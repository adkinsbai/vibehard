import { type NextRequest, NextResponse } from 'next/server';
import { isKnowledgeReviewer } from '@/lib/agent/knowledge';
import { forbidden, requestUser, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { EdaModuleCatalogError, listPublishedNativeModules, moduleMutationSameOrigin, submitNativeModule } from '@/lib/server/eda-module-catalog';

export const runtime = 'nodejs';

async function bodyWithinLimit(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new EdaModuleCatalogError('仅接受 JSON 模块包', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new EdaModuleCatalogError('缺少模块包');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) { await reader.cancel(); throw new EdaModuleCatalogError('模块包请求超过 3 MB', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new EdaModuleCatalogError('模块包 JSON 无效', 400); }
}

const failure = (error: unknown) => NextResponse.json({ error: error instanceof EdaModuleCatalogError ? error.message : '模块目录暂时不可用' }, {
  status: error instanceof EdaModuleCatalogError ? error.status : 503,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request: NextRequest) {
  if (!await requestUser(request)) return unauthorized();
  try { return NextResponse.json({ modules: await listPublishedNativeModules() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  const user = await requestUser(request); if (!user) return unauthorized();
  if (!isKnowledgeReviewer(user.role)) return forbidden('仅管理员或开发者可以提交原生模块');
  if (!moduleMutationSameOrigin(request)) return forbidden('请求来源不匹配');
  if (!consumeRateLimit('eda-module-submit', user.id, 2, 60_000).allowed) return NextResponse.json({ error: '模块提交过于频繁' }, { status: 429 });
  try {
    const body = await bodyWithinLimit(request);
    if (!body || typeof body !== 'object' || !('manifest' in body) || !('filesBase64' in body)) throw new EdaModuleCatalogError('模块包需包含 manifest 和 filesBase64', 400);
    const submitted = await submitNativeModule(user.id, body as { manifest: unknown; filesBase64: unknown }, request.signal);
    return NextResponse.json({ module: submitted }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
