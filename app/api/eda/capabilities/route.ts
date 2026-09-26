import { type NextRequest, NextResponse } from 'next/server';
import { requestUser, unauthorized } from '@/lib/server/http';
import { runtimeLlm } from '@/lib/server/llm-settings';
import { kicadAvailable } from '@/lib/server/eda-tools';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  if (!await requestUser(request)) return unauthorized();
  const [kicad, config] = await Promise.all([kicadAvailable(), runtimeLlm('design')]);
  return NextResponse.json({ kicad, agent: Boolean(config) }, { headers: { 'Cache-Control': 'no-store' } });
}
