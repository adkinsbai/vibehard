import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestUser, unauthorized } from '@/lib/server/http';
import { ownedProject } from '@/lib/server/store';
import { desktopRequest } from '@/lib/server/eda-desktop';
import { createEmptyDocument } from '@/lib/eda/document';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { readEdaJson } from '@/lib/server/eda-http';

export const runtime = 'nodejs';
const inputSchema = z.object({
  action: z.enum(['start', 'status', 'stop', 'archive', 'check', 'snapshot']),
  editor: z.enum(['schematic', 'pcb']).optional(),
  kind: z.enum(['erc', 'drc']).optional(),
  sources: z.object({ schematic: z.string().max(900_000).regex(/^\s*\(kicad_sch\b/), pcb: z.string().max(900_000).regex(/^\s*\(kicad_pcb\b/) }).strict().optional(),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(request);
  if (!user) return unauthorized();
  const origin = request.headers.get('origin');
  // Next dev can normalize 127.0.0.1 to localhost in nextUrl. The browser's
  // immutable Host header is the authoritative target for same-origin requests.
  const host = request.headers.get('host') ?? request.nextUrl.host;
  let sameOrigin = !origin;
  try { if (origin) sameOrigin = new URL(origin).host === host && new URL(origin).protocol === request.nextUrl.protocol; } catch { sameOrigin = false; }
  if (!sameOrigin) return NextResponse.json({ error: '请求来源不匹配' }, { status: 403 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success || !await ownedProject(user.id, id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  let body: unknown;
  try { body = await readEdaJson(request); }
  catch { return NextResponse.json({ error: '请求为空、格式不正确或超过 2 MB 限制' }, { status: 400 }); }
  try {
    const input = inputSchema.parse(body);
    if (input.action === 'check' && !input.kind) return NextResponse.json({ error: '请选择 ERC 或 DRC' }, { status: 400 });
    if (input.action === 'start' && !input.sources) {
      const empty = createEmptyDocument();
      input.sources = { schematic: exportKicadSchematic(empty), pcb: exportKicadPcb(empty) };
    }
    const response = await desktopRequest(user.id, id, input);
    const binary = response.ok && input.action === 'archive';
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'Content-Type': binary ? 'application/zip' : 'application/json', 'Cache-Control': 'no-store', ...(binary ? { 'Content-Disposition': 'attachment; filename="kicad-project.zip"' } : {}) },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: '请求或原生文件格式不正确（总量上限 2 MB）' }, { status: 400 });
    return NextResponse.json({ error: '无法连接 KiCad 桌面服务。已保存文件不会被覆盖，请稍后重连。' }, { status: 503 });
  }
}
