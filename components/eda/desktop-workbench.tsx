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
type Sources = { schematic: string; pcb: string; project?: string; symLibTable?: string; fpLibTable?: string; designRules?: string };
type RouteSummary = { unconnected: number; schematicParity: number; violations: Record<string, number>; violationSignatures?: Record<string, number> };
type RouteJob = { jobId: string; projectId: string; state: 'queued' | 'running' | 'ready' | 'failed'; before?: RouteSummary; after?: RouteSummary; sourceSha256?: string; candidateSha256?: string; error?: string };
type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';
const DRAFT = 'vibehard-eda-draft-v1';
const PENDING_ROUTE = 'vibehard-eda-pending-route-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

type PendingRoute = { sourceProjectId: string; jobId: string; id: string; sources?: Sources };

function readPendingRoute(): PendingRoute | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ROUTE);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('Invalid pending route');
    const record = value as Record<string, unknown>;
    if (!UUID.test(String(record.sourceProjectId)) || !UUID.test(String(record.jobId)) || !UUID.test(String(record.id)) || Object.keys(record).some(key => !['sourceProjectId', 'jobId', 'id'].includes(key))) throw new Error('Invalid pending route');
    return { sourceProjectId: String(record.sourceProjectId), jobId: String(record.jobId), id: String(record.id) };
  } catch {
    try { sessionStorage.removeItem(PENDING_ROUTE); } catch { /* Storage may be disabled. */ }
    return null;
  }
}

function clearPendingRoute() {
  try { sessionStorage.removeItem(PENDING_ROUTE); } catch { /* In-memory state still clears. */ }
}

function persistPendingRoute(record: PendingRoute) {
  sessionStorage.setItem(PENDING_ROUTE, JSON.stringify({ sourceProjectId: record.sourceProjectId, jobId: record.jobId, id: record.id }));
}

function routeIssueCount(summary: RouteSummary) {
  return Object.values(summary.violations).reduce((sum, count) => sum + count, 0);
}

function checkedRouteCandidate(value: unknown, job: RouteJob): Sources {
  if (!value || typeof value !== 'object') throw new Error('布线候选格式不正确');
  const candidate = value as Record<string, unknown>;
  if (candidate.jobId !== job.jobId || candidate.state !== 'ready' || candidate.sourceSha256 !== job.sourceSha256 || candidate.candidateSha256 !== job.candidateSha256 || !SHA256.test(String(candidate.sourceSha256)) || !SHA256.test(String(candidate.candidateSha256))) {
    throw new Error('布线候选已变化，请重新发起任务');
  }
  const sources = candidate.sources as Sources | undefined;
  if (!sources || typeof sources !== 'object' || Object.keys(sources).some(key => !['schematic', 'pcb', 'project', 'symLibTable', 'fpLibTable', 'designRules'].includes(key)) ||
      typeof sources.schematic !== 'string' || typeof sources.pcb !== 'string' || typeof sources.project !== 'string' ||
      !/^\s*\(kicad_sch\b/.test(sources.schematic) || !/^\s*\(kicad_pcb\b/.test(sources.pcb) ||
      new TextEncoder().encode(sources.schematic).byteLength > 900_000 || new TextEncoder().encode(sources.pcb).byteLength > 900_000 || new TextEncoder().encode(sources.project).byteLength > 128_000) {
    throw new Error('布线候选文件格式或大小不符合导入限制');
  }
  try { const parsed: unknown = JSON.parse(sources.project); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); }
  catch { throw new Error('布线候选的 KiCad 项目配置不正确'); }
  for (const [name, root] of [['symLibTable', 'sym_lib_table'], ['fpLibTable', 'fp_lib_table']] as const) {
    const table = sources[name];
    if (table !== undefined && (typeof table !== 'string' || !new RegExp(`^\\s*\\(${root}\\b`).test(table) || new TextEncoder().encode(table).byteLength > 128_000)) throw new Error('布线候选库表不符合导入限制');
  }
  if (sources.designRules !== undefined && (typeof sources.designRules !== 'string' || !sources.designRules.length || new TextEncoder().encode(sources.designRules).byteLength > 128_000)) throw new Error('布线候选设计规则不符合导入限制');
  if (Object.values(sources).reduce((sum, item) => sum + new TextEncoder().encode(item).byteLength, 0) > 1_850_000 || new TextEncoder().encode(JSON.stringify({ action: 'start', editor: 'schematic', sources })).byteLength > 1_900_000) throw new Error('布线候选总量超过 1.9 MB 导入限制');
  return sources;
}

async function jsonResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
  return body;
}

async function request(id: string, body: object) {
  return fetch(apiPath(`/api/eda/desktop/${id}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const [routeJob, setRouteJob] = useState<RouteJob | null>(null);
  const [routeReviewed, setRouteReviewed] = useState(false);
  const [pendingRouteProject, setPendingRouteProject] = useState<PendingRoute | null>(null);
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
      if (active) {
        setLoginRequired(false); setProjects(data.projects);
        const pending = readPendingRoute();
        if (pending && Array.isArray(data.projects) && data.projects.some((item: Project) => item.id === pending.sourceProjectId) && data.projects.some((item: Project) => item.id === pending.id)) {
          setProjectId(pending.sourceProjectId);
          setPendingRouteProject(pending);
          setRouteJob({ jobId: pending.jobId, projectId: pending.sourceProjectId, state: 'queued' });
          setMessage('正在重新核对待导入的布线候选；原工程仍保留。');
        } else if (pending) clearPendingRoute();
      }
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

  useEffect(() => {
    if (!routeJob || routeJob.projectId !== projectId || (routeJob.state !== 'queued' && routeJob.state !== 'running')) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await jsonResponse(await request(routeJob.projectId, { action: 'routeStatus', jobId: routeJob.jobId })) as Omit<RouteJob, 'projectId'>;
        if (!active) return;
        if (data.jobId !== routeJob.jobId || !['queued', 'running', 'ready', 'failed'].includes(data.state)) throw new Error('布线任务状态不正确');
        setRouteJob({ ...data, projectId: routeJob.projectId });
        if (data.state === 'failed') setError(data.error || '自动布线失败，请查看原工程后重试');
        if (data.state === 'ready') setMessage('自动布线候选已生成，请审阅检查结果');
        if (data.state === 'queued' || data.state === 'running') timer = window.setTimeout(poll, 3000);
      } catch (cause) {
        if (!active) return;
        setRouteJob(current => current?.jobId === routeJob.jobId ? { ...current, state: 'failed' } : current);
        setError(cause instanceof Error ? cause.message : '无法获取自动布线任务状态');
      }
    };
    void poll();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  // The job identity and state control the polling lifetime; updates with the same state keep their timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeJob?.jobId, routeJob?.state, projectId]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const start = async (id: string, mode: 'schematic' | 'pcb', sources?: Sources, verifySources = false) => {
    setConnection('connecting');
    try {
      const state: DesktopState = await jsonResponse(await request(id, { action: 'start', editor: mode, ...(sources ? { sources } : {}), ...(verifySources ? { verifySources: true } : {}) }));
      if (!state.ticket) throw new Error('桌面服务未返回连接票据');
      setProjectId(id); setEditor(mode); setFiles(state.files); setTicket(state.ticket); setReport('');
    } catch (cause) { setConnection('disconnected'); throw cause; }
  };
  const create = async (sources?: Sources, requestedName = name) => {
    if (requestedName.trim().length < 2) throw new Error('工程名称至少需要两个字符');
    const data = await jsonResponse(await fetch(apiPath('/api/projects'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: requestedName.trim(), workspaceKey: `eda-${crypto.randomUUID()}` }) }));
    setProjects(current => [...current, data.project]);
    await start(data.project.id, 'schematic', sources);
    setRouteJob(null); setRouteReviewed(false); setPendingRouteProject(null);
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
  const startRouting = async () => {
    const data = await jsonResponse(await request(projectId, { action: 'routeStart' })) as Omit<RouteJob, 'projectId'>;
    if (!/^[0-9a-f-]{36}$/i.test(data.jobId) || !['queued', 'running', 'ready'].includes(data.state)) throw new Error('布线服务未返回有效任务');
    clearPendingRoute();
    setRouteJob({ ...data, projectId }); setRouteReviewed(false); setPendingRouteProject(null);
    setMessage('已提交自动布线任务；可继续使用 KiCad 编辑器。任务只读取已保存的文件。');
  };
  const reviewRoute = async () => {
    if (!routeJob || routeJob.projectId !== projectId || routeJob.state !== 'ready') throw new Error('布线候选尚未准备好');
    const candidate = await jsonResponse(await request(projectId, { action: 'routeCandidate', jobId: routeJob.jobId }));
    checkedRouteCandidate(candidate, routeJob);
    setRouteReviewed(true);
    setMessage('已核对候选文件和源工程指纹；确认后会创建一个新工程，原工程保留。');
  };
  const acceptRoute = async () => {
    if (!routeJob || routeJob.projectId !== projectId || routeJob.state !== 'ready' || !routeReviewed) throw new Error('请先审阅布线候选');
    let destinationId = pendingRouteProject?.jobId === routeJob.jobId && pendingRouteProject.sourceProjectId === projectId ? pendingRouteProject.id : null;
    let sources = pendingRouteProject?.jobId === routeJob.jobId && pendingRouteProject.sourceProjectId === projectId ? pendingRouteProject.sources : null;
    if (destinationId && !sources) {
      const candidate = await jsonResponse(await request(projectId, { action: 'routeCandidate', jobId: routeJob.jobId }));
      sources = checkedRouteCandidate(candidate, routeJob);
      if (!window.confirm('将重新打开待导入候选工程。为腾出运行名额，来源 KiCad 桌面会结束；请确认所有窗口已保存。')) return;
      await jsonResponse(await request(projectId, { action: 'stop' }));
      setTicket(null); setConnection('idle');
      setPendingRouteProject({ sourceProjectId: projectId, jobId: routeJob.jobId, id: destinationId, sources });
    }
    if (!destinationId) {
      const candidate = await jsonResponse(await request(projectId, { action: 'routeCandidate', jobId: routeJob.jobId }));
      const candidateSources = checkedRouteCandidate(candidate, routeJob);
      sources = candidateSources;
      if (!window.confirm('接受候选会结束当前 KiCad 桌面，以腾出运行名额。请确认原理图和 PCB 窗口都已保存；未保存的窗口修改会丢失。原工程的已保存文件仍会保留。')) return;
      try { sessionStorage.setItem(`${PENDING_ROUTE}-probe`, '1'); sessionStorage.removeItem(`${PENDING_ROUTE}-probe`); }
      catch { throw new Error('浏览器会话存储不可用，无法保证失败后恢复候选'); }
      await jsonResponse(await request(projectId, { action: 'stop' }));
      setTicket(null); setConnection('idle');
      const requestedName = `${current?.name ?? name} · 自动布线候选`.slice(0, 80);
      const data = await jsonResponse(await fetch(apiPath('/api/projects'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: requestedName, workspaceKey: `eda-${crypto.randomUUID()}` }) }));
      const createdId: unknown = data.project?.id;
      if (typeof createdId !== 'string' || !/^[0-9a-f-]{36}$/i.test(createdId)) throw new Error('新工程未返回有效编号');
      destinationId = createdId;
      setProjects(currentProjects => [...currentProjects, data.project]);
      const pending = { sourceProjectId: projectId, jobId: routeJob.jobId, id: createdId, sources: candidateSources };
      setPendingRouteProject(pending);
      persistPendingRoute(pending);
    }
    if (!destinationId || !sources) throw new Error('布线候选文件不可用');
    await start(destinationId, 'schematic', sources, true);
    clearPendingRoute(); setRouteJob(null); setRouteReviewed(false); setPendingRouteProject(null);
    setMessage('候选已复制为你的新 KiCad 工程；原工程及其已保存文件保留。请在新工程中复核 PCB。');
  };
  const close = async () => {
    if (!window.confirm('结束 KiCad 会话？请先在原理图和 PCB 窗口分别保存。未保存修改将丢失。')) return;
    await jsonResponse(await request(projectId, { action: 'stop' }));
    setTicket(null); setConnection('idle'); setMessage('会话已结束，已保存工程文件保留');
  };
  const current = projects.find(project => project.id === projectId);
  return <main className={styles.shell} ref={frame}>
    <header className={styles.header}><a href={apiPath('/app')} className={styles.brand}><CircuitBoard size={23} /><strong>VibeHard</strong><span>KiCad 工作台</span></a><span className={styles.projectName}>{current?.name ?? '原生工程编辑'}</span><span className={styles.badge}>独立工程桌面</span></header>
    <div className={styles.betaNotice} role="note" aria-label="公开测试版说明"><strong>公开测试版 · 不可用于正式硬件设计</strong><span>AI 生成的原理图、模块及 PCB 布线均需硬件工程师审核；ERC/DRC 通过不代表电路功能或可制造性已验证。</span></div>
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
          <label>选择工程<select aria-label="选择工程" value={projectId} disabled={busy} onChange={event => { setProjectId(event.target.value); setFiles([]); setTicket(null); setConnection('idle'); setReport(''); setRouteJob(null); setRouteReviewed(false); setPendingRouteProject(null); }}><option value="">选择已有工程</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
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
        <h2>PCB 自动布线</h2>
        <button disabled={!projectId || busy || routeJob?.state === 'queued' || routeJob?.state === 'running'} onClick={() => void run(startRouting)}>自动布线</button>
        <p className={styles.hint}>先在 KiCad 中保存原理图和 PCB。任务只使用磁盘文件，不会覆盖当前工程；运行中仍可使用编辑器。原理图和 PCB 各限 900 KB，工程配置、库表和设计规则各限 128 KB，完整候选导入请求限 1.9 MB。其他自定义原生文件会被拒绝，以免候选丢失依赖。</p>
        {routeJob && <div className={styles.routePanel} role="status">
          <strong>{routeJob.state === 'queued' ? '等待布线资源' : routeJob.state === 'running' ? '正在自动布线' : routeJob.state === 'failed' ? '布线失败' : '候选已就绪'}</strong>
          {routeJob.before && routeJob.after && <p>未布通 {routeJob.before.unconnected} → {routeJob.after.unconnected}<br />原理图不一致 {routeJob.before.schematicParity} → {routeJob.after.schematicParity}<br />其他 DRC 问题 {routeIssueCount(routeJob.before)} → {routeIssueCount(routeJob.after)}</p>}
          {routeJob.error && <p className={styles.error}>{routeJob.error}</p>}
          {routeJob.state === 'failed' && pendingRouteProject?.jobId === routeJob.jobId && <button disabled={busy} onClick={() => { setError(''); setRouteJob({ jobId: routeJob.jobId, projectId, state: 'queued' }); }}>重新检查候选</button>}
          {routeJob.state === 'ready' && <>
            <button disabled={busy || (pendingRouteProject?.jobId === routeJob.jobId && !!pendingRouteProject.sources)} onClick={() => void run(reviewRoute)}>审阅布线候选</button>
            {routeReviewed && <><p>源 PCB 指纹：{routeJob.sourceSha256?.slice(0, 12)}…<br />候选指纹：{routeJob.candidateSha256?.slice(0, 12)}…</p><p>{pendingRouteProject?.jobId === routeJob.jobId ? '新工程记录已建立，但候选尚未导入。可重试打开；原工程仍保留。' : '接受后会结束当前桌面，创建新 KiCad 工程；原工程已保存文件保持不变。'}新工程仍需人工复核。</p><button className={styles.primary} disabled={busy} onClick={() => void run(acceptRoute)}>{pendingRouteProject?.jobId === routeJob.jobId ? '重试打开候选工程' : '接受为新工程'}</button></>}
          </>}
        </div>}
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
