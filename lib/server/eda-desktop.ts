import { readFile } from 'node:fs/promises';

export type DesktopAction = {
  action: 'start' | 'status' | 'stop' | 'archive' | 'check' | 'snapshot';
  editor?: 'schematic' | 'pcb';
  kind?: 'erc' | 'drc';
  sources?: { schematic: string; pcb: string };
};

export async function desktopRequest(owner: string, project: string, action: DesktopAction): Promise<Response> {
  const production = process.env.NODE_ENV === 'production';
  const endpoint = production ? process.env.EDA_MANAGER_URL : process.env.EDA_DESKTOP_URL;
  const tokenPath = production ? process.env.EDA_MANAGER_TOKEN_FILE : process.env.EDA_DESKTOP_TOKEN_FILE;
  if (!endpoint || !tokenPath) {
    return Response.json({ error: 'KiCad 桌面运行环境尚未启用。' }, { status: 503 });
  }
  let url: URL;
  try { url = new URL(endpoint); }
  catch { return Response.json({ error: 'KiCad 桌面服务地址无效。' }, { status: 503 }); }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
    return Response.json({ error: 'KiCad 控制服务必须绑定本机回环地址。' }, { status: 503 });
  }
  const token = (await readFile(tokenPath, 'utf8')).trim();
  return fetch(new URL(`/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(project)}`, url), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(action), cache: 'no-store', signal: AbortSignal.timeout(production && ['start', 'check', 'snapshot'].includes(action.action) ? 125_000 : action.action === 'check' || action.action === 'snapshot' ? 100_000 : 45_000),
  });
}
