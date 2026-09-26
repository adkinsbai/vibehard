import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized, isResourceId } from '@/lib/server/http';
import { ownedProject } from '@/lib/server/store';
import { loadEdaProject, saveEdaProject } from '@/lib/server/eda-store';
import { readEdaJson, edaFailure } from '@/lib/server/eda-http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
async function authorized(request: NextRequest, context: Context) {
  const user = await requestUser(request); if (!user) return { response: unauthorized() };
  const { id } = await context.params;
  if (!isResourceId(id) || !await ownedProject(user.id, id)) return { response: NextResponse.json({ error: '项目不存在' }, { status: 404 }) };
  return { user, id };
}
export async function GET(request: NextRequest, context: Context) {
  const scope = await authorized(request, context); if (scope.response) return scope.response;
  try {
    const saved = await loadEdaProject(scope.user!.id, scope.id!);
    return saved ? NextResponse.json(saved, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: '项目还没有保存电路' }, { status: 404 });
  } catch (error) { return edaFailure(error); }
}
export async function PUT(request: NextRequest, context: Context) {
  const scope = await authorized(request, context); if (scope.response) return scope.response;
  try {
    const input = z.object({ document: z.unknown(), expectedVersion: z.number().int().positive().nullable() }).parse(await readEdaJson(request));
    return NextResponse.json(await saveEdaProject(scope.user!.id, scope.id!, input.document, input.expectedVersion), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return edaFailure(error); }
}
