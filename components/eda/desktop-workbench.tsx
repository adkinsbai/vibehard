'use client';

import { useEffect, useRef, useState } from 'react';
import { CircuitBoard, Download, Maximize2, RefreshCw, Save, FolderOpen, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import type RFB from '@novnc/novnc';
import { AgentPanel } from './agent-panel';
import { apiPath } from '@/lib/utils';
import styles from './desktop-workbench.module.css';

type Project = { id: string; name: string };
type SavedFile = { name: string; bytes: number; sha256: string };
type DesktopState = { running: boolean; files: SavedFile[]; ticket?: string };
type Sources = { schematic: string; pcb: string };
type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';
const DRAFT = 'vibehard-eda-draft-v1';

async function jsonResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
  return body;
}

export function DesktopWorkbench() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('未命名电路');
  const [loginRequired, setLoginRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('选择工程，打开 KiCad 开始编辑');
  const [editor, setEditor] = useState<'schematic' | 'pcb'>('schematic');
  const [connection, setConnection] = useState<Connection>('idle');
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [report, setReport] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);
  const [ticket, setTicket] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const rfb = useRef<RFB | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetch(apiPath('/api/projects')).then(async response => {
      if (!active) return;
      if (response.status === 401) { setLoginRequired(true); return; }
      const data = await jsonResponse(response);
      if (active) { setLoginRequired(false); setProjects(data.projects); }
    }).catch(() => { if (active) setError('无法获取工程列表，请检查平台服务。'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ticket || !viewport.current) return;
    let active = true;
    let client: RFB | undefined;
    let closed = false;
    const disconnect = () => { if (client && !closed) { closed = true; client.disconnect(); } };
    const target = viewport.current;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      disconnect();
      setConnection('disconnected');
      setError('桌面连接超时，请稍后重新连接。');
    }, 20_000);
    void import('@novnc/novnc').then(({ default: RemoteFrameBuffer }) => {
      if (!active) return;
      const url = new URL(apiPath('/eda-desktop/ws'), window.location.href);
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('ticket', ticket);
      client = new RemoteFrameBuffer(target, url.toString(), { shared: true });
      rfb.current = client;
      client.resizeSession = true;
      client.scaleViewport = false;
      client.qualityLevel = 9;
      client.compressionLevel = 2;
      client.focusOnClick = true;
      client.addEventListener('connect', () => {
        if (!active) return;
        window.clearTimeout(timeout);
        setConnection('connected');
        setMessage('已连接 KiCad · 在编辑器内按 Ctrl+S 保存');
        client?.focus();
      });
      client.addEventListener('disconnect', () => {
        closed = true;
        if (!active) return;
        window.clearTimeout(timeout);
        setConnection('disconnected');
        setMessage('连接已断开。重新连接可返回原来的编辑会话。');
      });
      client.addEventListener('securityfailure', () => { if (active) setError('桌面连接验证失败，请重新连接。'); });
    }).catch(() => { window.clearTimeout(timeout); if (active) { setError('无法加载 noVNC 编辑窗口'); setConnection('disconnected'); } });
    return () => { active = false; window.clearTimeout(timeout); disconnect(); rfb.current = null; };
  }, [ticket]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const request = async (id: string, body: object) => fetch(apiPath(`/api/eda/desktop/${id}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const start = async (id: string, mode: 'schematic' | 'pcb', sources?: Sources) => {
    setConnection('connecting');
    try {
      const state: DesktopState = await jsonResponse(await request(id, { action: 'start', editor: mode, ...(sources ? { sources } : {}) }));
      if (!state.ticket) throw new Error('桌面服务未返回连接票据');
      setProjectId(id); setEditor(mode); setFiles(state.files); setTicket(state.ticket); setReport('');
    } catch (cause) { setConnection('disconnected'); throw cause; }
  };
  const create = async (sources?: Sources, requestedName = name) => {
    if (requestedName.trim().length < 2) throw new Error('工程名称至少需要两个字符');
    const data = await jsonResponse(await fetch(apiPath('/api/projects'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: requestedName.trim(), workspaceKey: `eda-${crypto.randomUUID()}` }) }));
    setProjects(current => [...current, data.project]); setProjectId(data.project.id); setFiles([]); setTicket(null);
    await start(data.project.id, 'schematic', sources);
  };
  const migrate = async () => {
    const raw = localStorage.getItem(DRAFT);
    if (!raw) throw new Error('浏览器中没有旧版电路草稿');
    const [{ parseDocument }, exporters] = await Promise.all([import('@/lib/eda/document'), import('@/lib/eda/kicad')]);
    const doc = parseDocument(JSON.parse(raw));
    await create({ schematic: exporters.exportKicadSchematic(doc), pcb: exporters.exportKicadPcb(doc) });
    setMessage('已复制为原生 KiCad 工程；旧版浏览器草稿仍保留');
  };
  const importFiles = async (selected: File[]) => {
    if (!selected.length || selected.length > 2) throw new Error('请选择一份原理图和／或一份 PCB 文件');
    const { createEmptyDocument } = await import('@/lib/eda/document');
    const exporters = await import('@/lib/eda/kicad');
    const empty = createEmptyDocument();
    const sources = { schematic: exporters.exportKicadSchematic(empty), pcb: exporters.exportKicadPcb(empty) };
    const seen = new Set<string>();
    for (const file of selected) {
      const kind = file.name.endsWith('.kicad_sch') ? 'schematic' : file.name.endsWith('.kicad_pcb') ? 'pcb' : null;
      if (!kind || seen.has(kind)) throw new Error('每种类型只能导入一份 KiCad 文件');
      if (file.size > 900_000) throw new Error('当前入口限制单文件 900 KB');
      seen.add(kind); sources[kind] = await file.text();
      if (kind === 'schematic' && /\(sheet\s/.test(sources[kind].replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""'))) throw new Error('当前导入入口仅支持单页原理图，暂不支持包含关联子页的工程。');
    }
    await create(sources);
  };
  const savedFiles = async () => {
    const state: DesktopState = await jsonResponse(await request(projectId, { action: 'status' }));
    setFiles(state.files); setMessage('已刷新磁盘文件；未保存的窗口内容不包含在内');
  };
  const download = async () => {
    const response = await request(projectId, { action: 'archive' });
    if (!response.ok) { await jsonResponse(response); return; }
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = href; link.download = 'kicad-project.zip'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    setMessage('已下载原生工程文件。下载内容以 KiCad 最后一次保存为准。');
  };
  const save = () => {
    const client = rfb.current;
    if (!client) return;
    client.focus(); client.sendKey(0xffe3, 'ControlLeft', true); client.sendKey(0x73, 'KeyS', true); client.sendKey(0x73, 'KeyS', false); client.sendKey(0xffe3, 'ControlLeft', false);
    setMessage('已发送 Ctrl+S；请确认 KiCad 没有待处理的保存对话框，再刷新文件或导出');
  };
  const check = async (kind: 'erc' | 'drc') => {
    const data = await jsonResponse(await request(projectId, { action: 'check', kind }));
    const report = data.report as { sheets?: { violations?: unknown[] }[]; violations?: unknown[]; unconnected_items?: unknown[]; schematic_parity?: unknown[] };
    const electrical = report.sheets?.reduce((count, sheet) => count + (sheet.violations?.length ?? 0), 0) ?? 0;
    const board = report.violations?.length ?? 0;
    const unconnected = report.unconnected_items?.length ?? 0;
    const parity = report.schematic_parity?.length ?? 0;
    const total = electrical + board + unconnected + parity;
    const label = kind === 'drc' ? 'DRC（含原理图一致性）' : 'ERC';
    const details = kind === 'drc' ? `板级 ${board} · 未布通 ${unconnected} · 原理图不一致 ${parity}` : `电气规则 ${electrical}`;
    setReport(`${label} · ${total} 项问题 · ${details} · 退出码 ${data.exitCode}\n检查对象：磁盘上已保存的原生文件；规则未报错不代表电路功能或可制造性已验证。\n\n${JSON.stringify(report, null, 2)}`);
    setMessage(`${label}：${total} 项问题，详情见检查结果`);
  };
  const close = async () => {
    if (!window.confirm('结束 KiCad 会话？请先在原理图和 PCB 窗口分别保存。未保存修改将丢失。')) return;
    await jsonResponse(await request(projectId, { action: 'stop' }));
    setTicket(null); setConnection('idle'); setMessage('会话已结束，已保存工程文件保留');
  };
  const current = projects.find(project => project.id === projectId);
  return <main className={styles.shell} ref={frame}>
    <header className={styles.header}><a href={apiPath('/app')} className={styles.brand}><CircuitBoard size={23} /><strong>VibeHard</strong><span>KiCad 工作台</span></a><span className={styles.projectName}>{current?.name ?? '原生工程编辑'}</span><span className={styles.badge}>独立工程桌面</span></header>
    <div className={styles.toolbar} role="toolbar" aria-label="KiCad 工作台工具">
      <button aria-label={sidebar ? '收起工程面板' : '展开工程面板'} onClick={() => setSidebar(!sidebar)}>{sidebar ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
      <div className={styles.tabs}><button disabled={!projectId || busy} aria-pressed={editor === 'schematic'} onClick={() => void run(() => start(projectId, 'schematic'))}>原理图</button><button disabled={!projectId || busy} aria-pressed={editor === 'pcb'} onClick={() => void run(() => start(projectId, 'pcb'))}>PCB</button></div>
      <button disabled={connection !== 'connected'} onClick={save}><Save size={16} />保存 Ctrl+S</button>
      <button disabled={!projectId || busy} onClick={() => void run(() => start(projectId, editor))}><RefreshCw size={16} />重新连接</button>
      <button disabled={!projectId || busy} onClick={() => void run(download)}><Download size={16} />下载工程</button>
      <button aria-pressed={agentOpen} onClick={() => setAgentOpen(!agentOpen)}><Sparkles size={16} />Agent 画图</button>
      <button className={styles.fullscreen} onClick={() => void run(async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); })}><Maximize2 size={16} />全屏</button>
    </div>
    <div className={`${styles.workspace} ${sidebar ? '' : styles.collapsed} ${agentOpen ? styles.agentOpen : ''}`}>
      {sidebar && <aside className={styles.sidebar} aria-label="工程与文件">
        <h2>工程</h2>
        {loginRequired ? <div className={styles.note}><p>登录后可打开属于你的 KiCad 工程。</p><a className={styles.primaryLink} href={apiPath('/login')}>登录平台</a></div> : <>
          <label>选择工程<select aria-label="选择工程" value={projectId} disabled={busy} onChange={event => { setProjectId(event.target.value); setFiles([]); setTicket(null); setConnection('idle'); setReport(''); }}><option value="">选择已有工程</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <button className={styles.primary} disabled={!projectId || busy} onClick={() => void run(() => start(projectId, editor))}><FolderOpen size={16} />打开工程</button>
          <div className={styles.divider} /><label>新工程名称<input aria-label="新工程名称" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
          <button disabled={busy} onClick={() => void run(() => create())}>新建空白工程</button>
          <button disabled={busy} onClick={() => upload.current?.click()}>导入文件并新建工程</button>
          <input className={styles.hidden} ref={upload} type="file" accept=".kicad_sch,.kicad_pcb" multiple onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ''; if (selected.length) void run(() => importFiles(selected)); }} />
          <button disabled={busy} onClick={() => void run(migrate)}>复制旧版草稿为新工程</button>
          <p className={styles.hint}>导入单页原理图或 PCB，单文件上限 900 KB；暂不支持完整多页工程和自定义库包导入。原始浏览器草稿会保留。</p>
        </>}
        <h2>已保存文件 <button aria-label="刷新已保存文件" disabled={!projectId || busy} onClick={() => void run(savedFiles)}><RefreshCw size={14} /></button></h2>
        <ul className={styles.fileList}>{files.map(file => <li key={file.name}><span title={file.name}>{file.name}</span><small>{(file.bytes / 1024).toFixed(1)} KB</small></li>)}</ul>
        {!files.length && <p className={styles.hint}>打开工程后显示磁盘文件。</p>}
        <h2>工程检查</h2><div className={styles.checks}><button disabled={!projectId || busy} onClick={() => void run(() => check('erc'))}>运行 ERC</button><button disabled={!projectId || busy} onClick={() => void run(() => check('drc'))}>运行 DRC</button></div>
        <p className={styles.hint}>检查和下载前，请先保存原理图及 PCB。DRC 同时核对原理图与 PCB；未保存的窗口内容不在检查范围内。</p>
        {report && <details open className={styles.report}><summary>检查结果</summary><pre>{report}</pre></details>}
        <div className={styles.divider} /><p className={styles.hint}>右侧 Agent 可从对话生成新原生工程。当前打开的工程仍由 KiCad 编辑。</p>
        <a href={apiPath('/eda/legacy')} target="_blank" rel="noreferrer">打开旧版草稿编辑器 ↗</a>
        <button className={styles.danger} disabled={!projectId || busy} onClick={() => void run(close)}>结束当前会话</button>
      </aside>}
      <section className={styles.editor} aria-label="KiCad 远程编辑器">
        <div className={styles.editorHeading}><strong>{editor === 'schematic' ? '原理图编辑器' : 'PCB 编辑器'}</strong><span>滚轮缩放 · 中键平移 · M 移动 · R 旋转 · Esc 取消</span></div>
        <div className={styles.viewport} ref={viewport} data-testid="kicad-viewport" />
        {connection !== 'connected' && <div className={styles.overlay}><CircuitBoard size={44} /><h1>{busy || connection === 'connecting' ? '正在连接 KiCad…' : connection === 'disconnected' ? 'KiCad 连接已断开' : '在浏览器中编辑原生工程'}</h1><p>{connection === 'disconnected' ? '重新连接会返回已有桌面，已保存文件会保留。' : '打开已有工程，或从空白原理图开始。'}</p>{error && <p role="alert" className={styles.error}>{error}</p>}{projectId && <button disabled={busy} className={styles.primary} onClick={() => void run(() => start(projectId, editor))}>连接编辑器</button>}</div>}
      </section>
      <div className={`${styles.agentDock} ${agentOpen ? '' : styles.agentHidden}`}><AgentPanel currentProjectId={projectId} onCreate={(sources, title) => create(sources, title)} /></div>
    </div>
    <footer className={styles.status}><span className={connection === 'connected' ? styles.live : ''}>{connection === 'connected' ? '● 已连接' : '○ 未连接'}</span><span role="status" className={error ? styles.error : ''}>{error || (busy ? '正在处理…' : message)}</span><span className={styles.engine}>KiCad / noVNC</span></footer>
  </main>;
}
