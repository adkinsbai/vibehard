import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { ownedProject } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success || !await ownedProject(user.id, id)) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ owner: user.id, project: id }, { headers: { 'Cache-Control': 'no-store' } });
}
