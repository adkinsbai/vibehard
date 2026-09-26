import { NextResponse } from 'next/server';
import { EdaConflictError } from './eda-store';

export async function readEdaJson(request: Request) {
  const limit = 2_000_000;
  if (Number(request.headers.get('content-length')) > limit) throw new Error('文件超过 2 MB 限制');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('请求内容为空');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('文件超过 2 MB 限制'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function edaFailure(error: unknown) {
  if (error instanceof EdaConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && (error.name === 'ZodError' || error instanceof SyntaxError)) return NextResponse.json({ error: '工程数据或请求格式不正确' }, { status: 400 });
  // Never return filesystem paths, model credentials, or native process errors.
  return NextResponse.json({ error: '操作失败，请检查工程输入；服务器日志可供管理员排查' }, { status: 400 });
}
