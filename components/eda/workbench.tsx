'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, CircuitBoard, Download, FileUp, Focus, Grip, Layers, RotateCw, Sparkles, Trash2, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react';
import { checkDocument } from '@/lib/eda/checks';
import { parseEditBatch } from '@/lib/eda/commands';
import { createEmptyDocument, parseDocument } from '@/lib/eda/document';
import { commitBatch, createHistory, redo, undo, type EditorHistory } from '@/lib/eda/history';
import { createComponent, PARTS, pinPosition } from '@/lib/eda/library';
import { apiPath } from '@/lib/utils';
import type { EdaComponent, EdaDocument, EditBatch, EditCommand, PartKind, PinRef, ViewMode } from '@/lib/eda/types';
import styles from './workbench.module.css';
import { NativeSymbol, NativePads } from './native-symbol';
import { importNativePcb } from '@/lib/eda/kicad-import';

const DRAFT_KEY = 'vibehard-eda-draft-v1';
const partNames: Record<PartKind, string> = { resistor: '旧电阻', capacitor: '旧电容', led: '旧 LED', connector2: '旧双针接口', connector4: '旧四针接口', mcu: '旧通用控制器', sensor: '旧通用传感器', r0603: '电阻', c0603: '电容', led0603: 'LED', header2: '双针接口', header4: '四针接口', esp32wroom32: 'ESP32-WROOM-32', tmp102: 'TMP102 温度传感器' };
const kinds: PartKind[] = ['r0603', 'c0603', 'led0603', 'header2', 'header4', 'esp32wroom32', 'tmp102'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;
const niceError = (error: unknown) => error instanceof Error ? error.message : '操作失败';

function download(name: string, contents: BlobPart, mime: string) {
  const href = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function nextPart(doc: EdaDocument, kind: PartKind): EdaComponent {
  const prefix = PARTS[kind].prefix;
  const existingRefs = new Set(doc.components.map((component) => component.ref));
  const existingIds = new Set(doc.components.map((component) => component.id));
  let index = 1;
  while (existingRefs.has(`${prefix}${index}`) || existingIds.has(`${kind}-${index}`)) index++;
  const component = createComponent(kind, index);
  for (const view of ['schematic', 'pcb'] as const) {
    const size = view === 'schematic' ? PARTS[kind].symbol : PARTS[kind].footprint;
    const area = view === 'schematic' ? { width: 220, height: 140 } : doc.board;
    const gap = view === 'schematic' ? 9 : 2;
    let found = false;
    for (let y = size.height / 2 + gap; y < area.height - size.height / 2 - gap && !found; y += gap) {
      for (let x = size.width / 2 + gap; x < area.width - size.width / 2 - gap && !found; x += gap) {
        const overlaps = doc.components.some(other => {
          const raw = view === 'schematic' ? PARTS[other.kind].symbol : PARTS[other.kind].footprint;
          const radians = other[view].rotation * Math.PI / 180;
          const width = Math.abs(Math.cos(radians)) * raw.width + Math.abs(Math.sin(radians)) * raw.height;
          const height = Math.abs(Math.sin(radians)) * raw.width + Math.abs(Math.cos(radians)) * raw.height;
          return Math.abs(x - other[view].x) < (size.width + width) / 2 + gap && Math.abs(y - other[view].y) < (size.height + height) / 2 + gap;
        });
        if (!overlaps) { component[view].x = round(x); component[view].y = round(y); found = true; }
      }
    }
    if (!found) throw new Error(view === 'pcb' ? '板上没有足够空位，请移动器件或扩大板框' : '原理图没有足够空位，请调整器件位置');
  }
  return component;
}

function SymbolShape({ component, view, selected }: { component: EdaComponent; view: ViewMode; selected: boolean }) {
  const part = PARTS[component.kind];
  const size = view === 'pcb' ? part.footprint : part.symbol;
  const w = size.width;
  const h = size.height;
  const stroke = selected ? '#007c73' : view === 'pcb' ? '#d7e5dd' : '#334757';
  if (part.native && view === 'schematic') return <NativeSymbol part={part} stroke={stroke} />;
  if (part.native && view === 'pcb') return <><rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke={stroke} strokeWidth=".15" /><NativePads part={part} /></>;
  if (view === 'pcb') return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx=".6" fill="#24594b" stroke={stroke} strokeWidth=".55" />;
  if (component.kind === 'resistor') return <><path d={`M -8 0 H ${-w / 2} M ${w / 2} 0 H 8`} stroke={stroke} strokeWidth=".55" /><rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#fff" stroke={stroke} strokeWidth=".55" /></>;
  if (component.kind === 'capacitor') return <><path d="M -8 0 H -1.5 M 1.5 0 H 8 M -1.5 -4 V 4 M 1.5 -4 V 4" stroke={stroke} strokeWidth=".6" /></>;
  if (component.kind === 'led') return <><path d="M -8 0 H -4 M 4 0 H 8 M -4 -3.5 V 3.5 L 3 -0.1 Z M 4 -4 V 4 M -1 -5 L 2 -8 M 2 -5 L 5 -8" stroke={stroke} fill="none" strokeWidth=".55" /></>;
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx=".5" fill="#fff" stroke={stroke} strokeWidth=".55" />;
}

type Project = { id: string; name: string };
type Proposal = { batch: EditBatch; model: string; summary: string };

export function EdaWorkbench({ accountMode: initialAccountMode = false }: { accountMode?: boolean }) {
  const [accountMode, setAccountMode] = useState(initialAccountMode);
  const [history, setHistory] = useState<EditorHistory>(() => createHistory(createEmptyDocument()));
  const [hydrated, setHydrated] = useState(false);
  const [damaged, setDamaged] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('schematic');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<PinRef | null>(null);
  const [tool, setTool] = useState<'select' | 'track'>('select');
  const [trackStart, setTrackStart] = useState<{ x: number; y: number } | null>(null);
  const [layer, setLayer] = useState<'top' | 'bottom'>('top');
  const [visibleLayers, setVisibleLayers] = useState({ top: true, bottom: true });
  const [selectedNetId, setSelectedNetId] = useState('');
  const [panel, setPanel] = useState<'inspector' | 'agent'>('inspector');
  const [bottom, setBottom] = useState<'checks' | 'nets' | 'history'>('checks');
  const [message, setMessage] = useState('新建电路 · 添加器件开始设计');
  const [error, setError] = useState('');
  const [refDraft, setRefDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');
  const [xDraft, setXDraft] = useState('');
  const [yDraft, setYDraft] = useState('');
  const [boardWidth, setBoardWidth] = useState('');
  const [boardHeight, setBoardHeight] = useState('');
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectVersion, setProjectVersion] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<{ agent: boolean; kicad: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [checkReport, setCheckReport] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ kind: 'component' | 'pan'; id?: string; start: { x: number; y: number }; origin: { x: number; y: number }; moved: boolean } | null>(null);
  const doc = history.present;
  const selected = doc.components.find((component) => component.id === selectedId) ?? null;
  const selectedTrack = doc.tracks.find((track) => track.id === selectedTrackId) ?? null;
  const internalIssues = useMemo(() => checkDocument(doc), [doc]);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser-only external storage after SSR hydration; guarded by the mount-only effect.
      try { setHistory(createHistory(parseDocument(JSON.parse(saved)))); }
      catch { setDamaged(saved); setError('本地草稿无法读取。原始内容仍保留在浏览器中。请先下载备份，再明确新建草稿或导入有效 JSON。'); }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || damaged) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Surface an external storage failure without discarding the unsaved document.
    catch { setError('浏览器本地存储不可写。请立即导出 JSON 备份。'); }
  }, [doc, hydrated, damaged]);

  useEffect(() => {
    void fetch(apiPath('/api/eda/capabilities')).then(async response => {
      if (response.ok) { setCapabilities(await response.json()); setAccountMode(true); }
      else { setCapabilities({ agent: false, kicad: false }); setAccountMode(false); }
    }).catch(() => setCapabilities({ agent: false, kicad: false }));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset editable drafts when selection, undo, or imported document changes the backing object.
    setRefDraft(selected?.ref ?? '');
    setValueDraft(selected?.value ?? '');
    setXDraft(selected ? String(selected[view].x) : '');
    setYDraft(selected ? String(selected[view].y) : '');
  }, [selected, view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset uncommitted form drafts after board undo or document import.
  useEffect(() => { setBoardWidth(String(doc.board.width)); setBoardHeight(String(doc.board.height)); }, [doc.board.width, doc.board.height]);

  const apply = useCallback((commands: EditCommand[], label: string, actor: 'user' | 'agent' = 'user', suggested?: EditBatch) => {
    try {
      const batch = suggested ?? { id: crypto.randomUUID(), baseRevision: history.present.revision, label, actor, commands };
      const next = commitBatch(history, batch);
      setHistory(next);
      setError(''); setMessage(label); setProposal(null);
      return true;
    } catch (cause) { setError(niceError(cause)); return false; }
  }, [history]);

  const addPart = (kind: PartKind) => {
    try { const component = nextPart(doc, kind);
      if (apply([{ type: 'addComponent', component }], `已添加 ${component.ref}`)) { setSelectedId(component.id); setPanel('inspector'); }
    } catch (cause) { setError(niceError(cause)); }
  };

  const connectPin = (pin: PinRef) => {
    const component = doc.components.find(c => c.id === pin.componentId)!;
    if (PARTS[component.kind].pins.find(p => p.id === pin.pinId)?.electrical === 'no_connect') { setError('该引脚在官方符号中标为 NC，不能连接'); return; }
    if (view === 'pcb') {
      const net = doc.nets.find(n => n.nodes.some(p => p.componentId === pin.componentId && p.pinId === pin.pinId));
      if (!net) { setError('请先在原理图中定义该焊盘的网络'); return; }
      if (tool !== 'track') { setSelectedNetId(net.id); setSelectedId(pin.componentId); return; }
      if (trackStart && selectedNetId !== net.id) { setError('不能把铜线连接到不同网络的焊盘'); return; }
      const point = pinPosition(component, pin.pinId, 'pcb');
      if (!trackStart) { setSelectedNetId(net.id); setTrackStart(point); setMessage(`从 ${component.ref}.${pin.pinId} 开始布线`); return; }
      if (apply([{ type: 'addTrack', track: { id: crypto.randomUUID(), netId: net.id, layer, width: 0.25, points: [trackStart, point] } }], `已连接 ${net.name} 焊盘`)) setTrackStart(null);
      return;
    }
    if (!pendingPin) { setPendingPin(pin); setMessage('选择第二个引脚以建立连接；Esc 可取消'); return; }
    if (pendingPin.componentId === pin.componentId && pendingPin.pinId === pin.pinId) { setPendingPin(null); return; }
    if (apply([{ type: 'connectPins', a: pendingPin, b: pin }], '已连接引脚')) setPendingPin(null);
  };

  const changeView = (next: ViewMode) => { setView(next); setTool('select'); setTrackStart(null); setPendingPin(null); setPan({ x: 0, y: 0 }); setZoom(1); };

  const screenToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: round(mapped.x), y: round(mapped.y) };
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget && !(event.target as Element).classList.contains(styles.canvasBack)) return;
    if (tool === 'track' && view === 'pcb') {
      if (!selectedNetId) { setError('请先在底部网络面板或右侧选定一个网络。'); return; }
      const world = screenToWorld(event.clientX, event.clientY);
      if (!world) return;
      const point = { x: round(world.x - 10), y: round(world.y - 10) };
      if (!trackStart) { setTrackStart(point); setMessage('选择走线终点'); return; }
      const net = doc.nets.find((item) => item.id === selectedNetId);
      if (!net) { setError('所选网络已不存在。'); setTrackStart(null); return; }
      if (apply([{ type: 'addTrack', track: { id: crypto.randomUUID(), netId: net.id, layer, width: 0.25, points: [trackStart, point] } }], `已添加 ${net.name} 走线`)) setTrackStart(null);
      return;
    }
    if (event.shiftKey || event.button === 1) {
      dragRef.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, origin: pan, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else { setSelectedId(null); setSelectedTrackId(null); }
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const baseWidth = view === 'schematic' ? 220 : Math.max(doc.board.width + 20, 100);
    const dx = (event.clientX - drag.start.x) * baseWidth / Math.max(bounds.width, 1) / zoom;
    const dy = (event.clientY - drag.start.y) * baseWidth / Math.max(bounds.width, 1) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > .1) drag.moved = true;
    if (drag.kind === 'pan') setPan({ x: drag.origin.x - dx, y: drag.origin.y - dy });
    else if (drag.id) {
      const node = event.currentTarget.querySelector(`[data-component-id="${drag.id}"]`) as SVGGElement | null;
      if (node) node.style.translate = `${dx}px ${dy}px`;
    }
  };

  const onCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.kind !== 'component' || !drag.id) return;
    const node = event.currentTarget.querySelector(`[data-component-id="${drag.id}"]`) as SVGGElement | null;
    if (node) node.style.translate = '';
    if (!drag.moved) return;
    const point = screenToWorld(event.clientX, event.clientY);
    const component = doc.components.find((item) => item.id === drag.id);
    if (point && component) {
      const dx = point.x - drag.start.x; const dy = point.y - drag.start.y;
      apply([{ type: 'moveComponent', id: drag.id, view, x: round(component[view].x + dx), y: round(component[view].y + dy) }], `已移动 ${component.ref}`);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = !!target?.closest('input,textarea,select,[contenteditable="true"]');
      if (event.key === 'Escape') { setPendingPin(null); setTrackStart(null); setTool('select'); return; }
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); setHistory((current) => event.shiftKey ? redo(current) : undo(current)); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); setHistory((current) => redo(current)); return; }
      if (event.key === 'Delete' && selectedId) { apply([{ type: 'removeComponent', id: selectedId }], '已删除器件'); setSelectedId(null); }
      if (event.key === 'Delete' && selectedTrackId) { apply([{ type: 'removeTrack', id: selectedTrackId }], '已删除走线'); setSelectedTrackId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedTrackId, apply]);

  const applyProperties = () => {
    if (!selected) return;
    const x = Number(xDraft); const y = Number(yDraft);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { setError('坐标必须是有限数值'); return; }
    const commands: EditCommand[] = [];
    if (refDraft !== selected.ref || valueDraft !== selected.value) commands.push({ type: 'setComponent', id: selected.id, changes: { ref: refDraft, value: valueDraft } });
    if (x !== selected[view].x || y !== selected[view].y) commands.push({ type: 'moveComponent', id: selected.id, view, x, y });
    if (commands.length) apply(commands, `已更新 ${selected.ref} 属性`);
  };

  const exportFile = async (type: 'json' | 'sch' | 'pcb' | 'bom' | 'nets' | 'report') => {
    try {
      const stem = doc.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'eda-project';
      if (type === 'json') download(`${stem}.json`, JSON.stringify(doc, null, 2), 'application/json');
      if (type === 'nets') { const { exportNetCsv } = await import('@/lib/eda/kicad'); download(`${stem}-nets.csv`, exportNetCsv(doc), 'text/csv'); }
      if (type === 'report') download(`${stem}-internal-checks.txt`, `VibeHard 内部结构检查（非 KiCad ERC/DRC）\n${internalIssues.length ? internalIssues.map((issue) => `[${issue.severity}] ${issue.message}`).join('\n') : '未发现内部结构问题；尚未完成 KiCad/ERC/DRC 与硬件验证。'}\n`, 'text/plain');
      if (type === 'sch' || type === 'pcb' || type === 'bom') {
        const exports = await import('@/lib/eda/kicad');
        if (type === 'sch') download(`${stem}.kicad_sch`, exports.exportKicadSchematic(doc), 'text/plain');
        if (type === 'pcb') download(`${stem}.kicad_pcb`, exports.exportKicadPcb(doc), 'text/plain');
        if (type === 'bom') download(`${stem}-bom.csv`, exports.exportBomCsv(doc), 'text/csv');
      }
      setMessage('文件已导出；请在 KiCad 中复核器件与封装');
    } catch (cause) { setError(`导出失败：${niceError(cause)}`); }
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) { setError('文件超过 1 MB 限制'); return; }
    setBusy(true);
    try {
      const source = await file.text();
      let parsed: EdaDocument;
      if (file.name.toLowerCase().endsWith('.kicad_sch')) {
        const response = await fetch(apiPath('/api/eda/import'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'KiCad 导入失败');
        parsed = parseDocument(data.document);
      } else if (file.name.toLowerCase().endsWith('.kicad_pcb')) parsed = importNativePcb(source, doc.components.length ? doc : undefined);
      else parsed = parseDocument(JSON.parse(source));
      if (!window.confirm('导入将替换当前浏览器草稿。建议先导出 JSON 备份，继续吗？')) return;
      setHistory(createHistory(parsed)); setDamaged(null); setSelectedId(null); setSelectedTrackId(null); setProposal(null); setProjectVersion(null);
      setError(''); setMessage(`已导入 ${parsed.name}`);
    } catch (cause) { setError(`导入失败：${niceError(cause)}。当前草稿未改变。`); } finally { setBusy(false); }
  };

  const loadProjects = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(apiPath('/api/projects'));
      if (!response.ok) throw new Error(response.status === 401 ? '请先登录以访问项目' : '项目列表不可用');
      const data = await response.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setMessage(`找到 ${data.projects?.length ?? 0} 个项目`);
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const loadProject = async () => {
    if (!projectId) return;
    if (!window.confirm('载入项目会替换当前浏览器草稿。请确认已导出需要保留的内容。')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(apiPath(`/api/eda/projects/${encodeURIComponent(projectId)}`));
      if (!response.ok) throw new Error(response.status === 404 ? '该项目尚无 EDA 文档' : `载入失败 (${response.status})`);
      const payload = await response.json();
      const parsed = parseDocument(payload.document);
      setHistory(createHistory(parsed)); setProjectVersion(payload.version); setSelectedId(null); setProposal(null); setMessage('已载入项目 EDA 文档');
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const saveProject = async () => {
    if (!projectId) { setError('请先选择项目'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(apiPath(`/api/eda/projects/${encodeURIComponent(projectId)}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: doc, expectedVersion: projectVersion }) });
      if (!response.ok) throw new Error(response.status === 409 ? '项目版本冲突：另一份修改已保存。请先导出本地 JSON，再载入项目比较。' : `保存失败 (${response.status})`);
      const payload = await response.json();
      setProjectVersion(payload.version); setMessage(`项目已保存 · 版本 ${payload.version}`);
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const askAgent = async () => {
    if (!prompt.trim()) { setError('请输入具体的修改要求'); return; }
    setBusy(true); setError(''); setProposal(null);
    try {
      const response = await fetch(apiPath('/api/eda/agent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: doc, prompt: prompt.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? data.message ?? `Agent 请求失败 (${response.status})`);
      const batch = parseEditBatch(data.batch);
      if (batch.baseRevision !== doc.revision) throw new Error('提案基于旧版本，请重新请求');
      setProposal({ batch, model: data.model ?? '未标识模型', summary: data.summary ?? batch.label });
      setMessage('Agent 提案已就绪，请审阅命令并手动应用');
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const runKicadCheck = async (kind: 'erc' | 'drc') => {
    setBusy(true); setError(''); setCheckReport('');
    try {
      const response = await fetch(apiPath('/api/eda/check'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: doc, kind }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? data.message ?? `检查失败 (${response.status})`);
      if (!data.available) { setCheckReport(data.message ?? 'KiCad CLI 不可用，未执行检查'); return; }
      setCheckReport(`${kind.toUpperCase()} 退出码 ${data.exitCode}\n${typeof data.report === 'string' ? data.report : JSON.stringify(data.report ?? {}, null, 2)}`);
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const exportArchive = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(apiPath('/api/eda/export'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: doc }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || '工程导出失败'); }
      download('vibehard-engineering.zip', await response.blob(), 'application/zip');
      setMessage('工程交付包已下载：包含源文件、BOM、Gerber、钻孔、ERC/DRC 报告和文件校验清单');
    } catch (cause) { setError(niceError(cause)); } finally { setBusy(false); }
  };

  const frame = view === 'schematic' ? { width: 220, height: 140 } : { width: Math.max(doc.board.width + 20, 100), height: Math.max(doc.board.height + 20, 75) };
  const viewport = { width: frame.width / zoom, height: frame.height / zoom, x: (frame.width - frame.width / zoom) / 2 + pan.x, y: (frame.height - frame.height / zoom) / 2 + pan.y };
  const locate = (part: EdaComponent) => view === 'pcb' ? { x: part.pcb.x + 10, y: part.pcb.y + 10 } : part.schematic;
  const locatePin = (part: EdaComponent, pinId: string) => { const pos = pinPosition(part, pinId, view); return view === 'pcb' ? { x: pos.x + 10, y: pos.y + 10 } : pos; };

  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark}><CircuitBoard size={16} /></span><strong>VibeHard</strong><span className={styles.brandSlash}>/</span><span>EDA 工作台</span></div>
      <div className={styles.documentTitle}><span className={styles.docDot} /><strong>{doc.name}</strong><span className={styles.revision}>REV {doc.revision}</span></div>
      <div className={styles.headerActions}><span className={styles.modePill}>{accountMode ? '项目模式' : '本地草稿'}</span><button type="button" onClick={() => { if (doc.components.length && !window.confirm('新建会替换当前草稿，请先保存项目或导出备份。继续？')) return; setHistory(createHistory(createEmptyDocument())); setSelectedId(null); setSelectedTrackId(null); setProposal(null); setProjectId(''); setProjectVersion(null); setCheckReport(''); setError(''); setMessage('已新建空白电路'); }}>新建</button><button type="button" onClick={() => void exportFile('json')}><Download size={14} /> 导出备份</button></div>
    </header>
    <div className={styles.toolbar} role="toolbar" aria-label="EDA 编辑工具">
      <div className={styles.segment}><button type="button" className={view === 'schematic' ? styles.active : ''} aria-pressed={view === 'schematic'} onClick={() => changeView('schematic')}>原理图</button><button type="button" className={view === 'pcb' ? styles.active : ''} aria-pressed={view === 'pcb'} onClick={() => changeView('pcb')}>PCB</button></div>
      <span className={styles.toolDivider} />
      <button type="button" title="选择并拖动" className={tool === 'select' ? styles.toolActive : ''} onClick={() => { setTool('select'); setTrackStart(null); }}><Grip size={15} /> 选择</button>
      {view === 'pcb' && <button type="button" title="单击画布起点及终点" className={tool === 'track' ? styles.toolActive : ''} onClick={() => { setTool('track'); setTrackStart(null); }}><Layers size={15} /> 走线</button>}
      <span className={styles.toolDivider} />
      <button type="button" aria-label="撤销" title="撤销 Ctrl+Z" disabled={!history.past.length} onClick={() => { setHistory((current) => undo(current)); setProposal(null); }}><Undo2 size={16} /></button>
      <button type="button" aria-label="重做" title="重做 Ctrl+Y" disabled={!history.future.length} onClick={() => { setHistory((current) => redo(current)); setProposal(null); }}><Redo2 size={16} /></button>
      <button type="button" aria-label="旋转选中器件" title="旋转 90°" disabled={!selected} onClick={() => selected && apply([{ type: 'moveComponent', id: selected.id, view, x: selected[view].x, y: selected[view].y, rotation: (selected[view].rotation + 90) % 360 }], `已旋转 ${selected.ref}`)}><RotateCw size={16} /></button>
      <button type="button" aria-label="删除选中项" title="删除 Delete" disabled={!selected && !selectedTrack} onClick={() => { if (selected) { apply([{ type: 'removeComponent', id: selected.id }], `已删除 ${selected.ref}`); setSelectedId(null); } else if (selectedTrack) { apply([{ type: 'removeTrack', id: selectedTrack.id }], '已删除走线'); setSelectedTrackId(null); } }}><Trash2 size={16} /></button>
      <div className={styles.toolbarSpacer} />
      <button type="button" aria-label="缩小" onClick={() => setZoom((value) => clamp(round(value - .25), .5, 3))}><ZoomOut size={16} /></button><span className={styles.zoom}>{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大" onClick={() => setZoom((value) => clamp(round(value + .25), .5, 3))}><ZoomIn size={16} /></button><button type="button" aria-label="适应画布" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Focus size={16} /></button>
    </div>
    <div className={styles.workspace}>
      <aside className={styles.library} aria-label="器件库"><div className={styles.panelHeading}><span>器件库</span><small>KiCad 10</small></div><p className={styles.sideNote}>官方符号、引脚与封装库。选择器件开始设计。</p><div className={styles.libraryList}>{kinds.map((kind) => <button key={kind} type="button" aria-label={`添加 ${partNames[kind]}`} onClick={() => addPart(kind)}><span className={styles.partIcon}>{PARTS[kind].prefix}</span><span><strong>{partNames[kind]}</strong><small>{PARTS[kind].defaultValue}</small></span><span className={styles.plus}>＋</span></button>)}</div><div className={styles.libraryFoot}><span>原理图 220 × 140 mm</span><span>PCB {doc.board.width} × {doc.board.height} mm</span></div></aside>
      <section className={styles.center} aria-label="设计画布">
        <div className={styles.canvasHead}><div><strong>{view === 'schematic' ? '原理图编辑' : 'PCB 布局与走线'}</strong><span>{view === 'schematic' ? '单击引脚两次建立网络 · 拖动器件调整位置' : '选择网络后单击两个点绘制铜线 · 官方封装尺寸'}</span></div><span className={styles.canvasScale}>mm / 1:1</span></div>
        <div className={`${styles.canvasWrap} ${view === 'pcb' ? styles.pcbCanvas : ''}`}>
          <svg ref={svgRef} role="img" aria-label={`${view === 'pcb' ? 'PCB' : '原理图'} 编辑画布`} className={styles.canvas} viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp}>
            <defs><pattern id="eda-grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx=".4" cy=".4" r=".32" fill={view === 'pcb' ? '#457262' : '#ced8d5'} /></pattern></defs>
            <rect className={styles.canvasBack} x={-500} y={-500} width={1200} height={1200} fill={view === 'pcb' ? '#163d35' : '#f9fbfa'} />
            <rect className={styles.canvasBack} x={0} y={0} width={frame.width} height={frame.height} fill="url(#eda-grid)" />
            {view === 'schematic' && <><path d="M 8 8 H 212 V 132 H 8 Z" fill="none" stroke="#b7cac5" strokeWidth=".35" /><text x="10" y="13" className={styles.sheetText}>VIBEHARD / SCHEMATIC / {doc.name}</text><text x="160" y="129" className={styles.sheetText}>REV {doc.revision} · KiCad</text></>}
            {view === 'pcb' && <rect className={styles.canvasBack} x="10" y="10" width={doc.board.width} height={doc.board.height} fill="#1b5943" stroke="#c9e8c5" strokeWidth=".2" />}
            {view === 'schematic' && doc.nets.map(net => <g key={net.id}>{net.nodes.map(node => { const part = doc.components.find(item => item.id === node.componentId); if (!part) return null; const point = locatePin(part, node.pinId); const definition = PARTS[part.kind]; const pin = definition.pins.find(p => p.id === node.pinId)!; if (definition.native && definition.pins.some(p => p.id !== pin.id && p.x === pin.x && p.y === pin.y && definition.pins.indexOf(p) < definition.pins.indexOf(pin))) return null; return <g key={`${node.componentId}-${node.pinId}`}><path d={`M ${point.x} ${point.y} h -5`} stroke="#158578" strokeWidth=".35" /><text x={point.x - 5.5} y={point.y - .7} textAnchor="end" className={styles.netLabel}>{net.name}</text></g>; })}</g>)}
            {view === 'pcb' && doc.tracks.filter((track) => visibleLayers[track.layer]).map((track) => <polyline key={track.id} role="button" aria-label={`选中走线 ${track.id}`} points={track.points.map((point) => `${point.x + 10},${point.y + 10}`).join(' ')} fill="none" stroke={track.id === selectedTrackId ? '#fff' : track.layer === 'top' ? '#e7a95f' : '#86b5e9'} strokeWidth={track.width} strokeLinecap="round" strokeLinejoin="round" onClick={() => { setSelectedTrackId(track.id); setSelectedId(null); setSelectedNetId(track.netId); }} />)}
            {doc.components.map((component) => { const pos = locate(component); const part = PARTS[component.kind]; return <g key={component.id} data-component-id={component.id} transform={`translate(${pos.x} ${pos.y}) rotate(${component[view].rotation})`} onPointerDown={(event) => { if (tool !== 'select') return; event.stopPropagation(); setSelectedId(component.id); setSelectedTrackId(null); const start = screenToWorld(event.clientX, event.clientY); if (start && !component.locked) { dragRef.current = { kind: 'component', id: component.id, start, origin: { x: pos.x, y: pos.y }, moved: false }; svgRef.current?.setPointerCapture(event.pointerId); } }}>
              <rect role="button" tabIndex={0} aria-label={`选中 ${component.ref} ${partNames[component.kind]}`} onClick={() => { setSelectedId(component.id); setSelectedTrackId(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(component.id); setSelectedTrackId(null); } }} x={-(view === 'pcb' ? part.footprint.width : part.symbol.width) / 2 - 3} y={-(view === 'pcb' ? part.footprint.height : part.symbol.height) / 2 - 3} width={(view === 'pcb' ? part.footprint.width : part.symbol.width) + 6} height={(view === 'pcb' ? part.footprint.height : part.symbol.height) + 6} fill="transparent" stroke={selectedId === component.id ? '#00a493' : 'transparent'} strokeWidth=".65" />
              <SymbolShape component={component} view={view} selected={selectedId === component.id} />
              {part.pins.map((pin) => { const pp = view === 'pcb' ? { x: pin.pcbX, y: pin.pcbY } : { x: pin.x, y: pin.y }; const armed = pendingPin?.componentId === component.id && pendingPin.pinId === pin.id; return <g key={pin.id}><circle role="button" tabIndex={0} aria-label={`连接引脚 ${component.ref}.${pin.id}`} cx={pp.x} cy={pp.y} r={view === 'pcb' ? 1 : .65} fill={armed ? '#eaa35a' : view === 'pcb' && part.native ? 'transparent' : view === 'pcb' ? '#e9ba78' : '#fff'} stroke={armed ? '#b25c20' : '#00887b'} strokeWidth=".5" onPointerDown={(event) => { event.stopPropagation(); dragRef.current = null; }} onClick={(event) => { event.stopPropagation(); connectPin({ componentId: component.id, pinId: pin.id }); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); connectPin({ componentId: component.id, pinId: pin.id }); } }} /><text x={pp.x + 1.8} y={pp.y - 1.5} className={styles.pinText}>{pin.name}</text></g>; })}
              <text x={0} y={-part.symbol.height / 2 - 5} textAnchor="middle" className={view === 'pcb' ? styles.pcbRef : styles.refText}>{component.ref}</text>
              {view === 'schematic' && <text x={0} y={part.symbol.height / 2 + 8} textAnchor="middle" className={styles.valueText}>{component.value}</text>}
            </g>; })}
            {trackStart && view === 'pcb' && <circle cx={trackStart.x + 10} cy={trackStart.y + 10} r=".6" fill="#fff" stroke="#e7a95f" pointerEvents="none" />}
          </svg>
          <div className={styles.canvasBadge}>{view === 'pcb' ? '2 层铜 · 官方封装' : '同名网络标签电气相连'}</div>
        </div>
        <div className={styles.bottomPanel}><div className={styles.bottomTabs}><button className={bottom === 'checks' ? styles.bottomActive : ''} onClick={() => setBottom('checks')}>检查 <span>{internalIssues.length}</span></button><button className={bottom === 'nets' ? styles.bottomActive : ''} onClick={() => setBottom('nets')}>网络 <span>{doc.nets.length}</span></button><button className={bottom === 'history' ? styles.bottomActive : ''} onClick={() => setBottom('history')}>历史</button></div><div className={styles.bottomContent}>{bottom === 'checks' ? <><div className={styles.checkActions}><span>内部结构检查 · 不等同 KiCad ERC/DRC</span>{accountMode && <><button disabled={busy || capabilities?.kicad === false} onClick={() => void runKicadCheck(view === 'pcb' ? 'drc' : 'erc')}>运行 KiCad {view === 'pcb' ? 'DRC' : 'ERC'}</button><span>{capabilities?.kicad === false ? 'KiCad CLI 不可用' : ''}</span></>}</div>{checkReport && <pre className={styles.checkReport}>{checkReport}</pre>}{internalIssues.length ? <ul>{internalIssues.map((issue) => <li key={issue.id} className={styles[issue.severity]}>{issue.severity.toUpperCase()} · {issue.message}</li>)}</ul> : <p>未发现内部结构问题。KiCad/ERC/DRC 与硬件验证仍需执行。</p>}</> : bottom === 'nets' ? <div className={styles.netList}>{doc.nets.map((net) => <button key={net.id} onClick={() => { setSelectedNetId(net.id); setMessage(`已选择网络 ${net.name}`); }} className={selectedNetId === net.id ? styles.selectedNet : ''}><span className={styles.netDot} />{net.name}<small>{net.nodes.length} 引脚</small></button>)}{!doc.nets.length && <p>还没有网络。在原理图中依次单击两个引脚。</p>}</div> : <p>当前修订 {doc.revision} · 可撤销 {history.past.length} 步 · 可重做 {history.future.length} 步。每次操作作为一个原子批次保存。</p>}</div></div>
      </section>
      <aside className={styles.inspector} aria-label="属性与 Agent"><div className={styles.rightTabs}><button className={panel === 'inspector' ? styles.rightActive : ''} onClick={() => setPanel('inspector')}>属性</button><button className={panel === 'agent' ? styles.rightActive : ''} onClick={() => setPanel('agent')}><Sparkles size={14} /> Agent</button></div>
        {panel === 'inspector' ? <div className={styles.panelBody}>
          {selected ? <><div className={styles.inspectorIdentity}><span className={styles.partIcon}>{PARTS[selected.kind].prefix}</span><div><strong>{selected.ref}</strong><small>{partNames[selected.kind]} · {PARTS[selected.kind].footprint.name}</small></div></div><div className={styles.formGrid}><label>位号<input aria-label="位号" value={refDraft} maxLength={32} onChange={(event) => setRefDraft(event.target.value)} /></label><label>器件值<input aria-label="器件值" value={valueDraft} maxLength={120} onChange={(event) => setValueDraft(event.target.value)} /></label><div className={styles.coordinateRow}><label>X / mm<input aria-label="X 坐标" type="number" step="0.1" value={xDraft} onChange={(event) => setXDraft(event.target.value)} /></label><label>Y / mm<input aria-label="Y 坐标" type="number" step="0.1" value={yDraft} onChange={(event) => setYDraft(event.target.value)} /></label></div><button className={styles.primaryButton} onClick={applyProperties}>应用属性</button><label className={styles.checkLabel}><input type="checkbox" checked={selected.locked} onChange={(event) => apply([{ type: 'setComponent', id: selected.id, changes: { locked: event.target.checked } }], event.target.checked ? '已锁定器件' : '已解锁器件')} />锁定器件位置</label></div><h3>引脚</h3><div className={styles.pinList}>{PARTS[selected.kind].pins.map((pin) => { const net = doc.nets.find((item) => item.nodes.some((node) => node.componentId === selected.id && node.pinId === pin.id)); return <div key={pin.id}><span>{pin.id} · {pin.name}</span><span>{net?.name ?? '未连接'}</span>{net && <button aria-label={`断开 ${selected.ref}.${pin.id}`} onClick={() => apply([{ type: 'disconnectPin', pin: { componentId: selected.id, pinId: pin.id } }], `已断开 ${selected.ref}.${pin.id}`)}>断开</button>}</div>; })}</div><p className={styles.sideNote}>{PARTS[selected.kind].description}</p></> : selectedTrack ? <><h3>走线 {selectedTrack.id}</h3><dl className={styles.detailList}><div><dt>网络</dt><dd>{doc.nets.find((net) => net.id === selectedTrack.netId)?.name}</dd></div><div><dt>层</dt><dd>{selectedTrack.layer === 'top' ? '顶层铜' : '底层铜'}</dd></div><div><dt>线宽</dt><dd>{selectedTrack.width} mm</dd></div></dl><button className={styles.dangerButton} onClick={() => { apply([{ type: 'removeTrack', id: selectedTrack.id }], '已删除走线'); setSelectedTrackId(null); }}>删除走线</button></> : <><div className={styles.emptySelection}>选择画布中的器件或走线以编辑属性。<br />原理图中单击两个引脚可创建网络。</div><h3>文档</h3><label className={styles.fieldLabel}>文档名称<input aria-label="文档名称" value={doc.name} maxLength={80} onChange={(event) => { const value = event.target.value; if (value) apply([{ type: 'renameDocument', name: value }], '已重命名文档'); }} /></label>{view === 'pcb' && <><h3>板框</h3><div className={styles.coordinateRow}><label>宽度 / mm<input aria-label="板框宽度" type="number" value={boardWidth} onChange={(event) => setBoardWidth(event.target.value)} /></label><label>高度 / mm<input aria-label="板框高度" type="number" value={boardHeight} onChange={(event) => setBoardHeight(event.target.value)} /></label></div><button onClick={() => apply([{ type: 'setBoard', width: Number(boardWidth), height: Number(boardHeight) }], '已更新板框')}>应用板框</button><h3>布线</h3><label className={styles.fieldLabel}>目标网络<select aria-label="目标网络" value={selectedNetId} onChange={(event) => setSelectedNetId(event.target.value)}><option value="">选择网络</option>{doc.nets.map((net) => <option key={net.id} value={net.id}>{net.name}</option>)}</select></label><div className={styles.layerPick}><button aria-pressed={layer === 'top'} onClick={() => setLayer('top')}>顶层铜</button><button aria-pressed={layer === 'bottom'} onClick={() => setLayer('bottom')}>底层铜</button></div><label className={styles.checkLabel}><input type="checkbox" checked={visibleLayers.top} onChange={(event) => setVisibleLayers({ ...visibleLayers, top: event.target.checked })} />显示顶层铜</label><label className={styles.checkLabel}><input type="checkbox" checked={visibleLayers.bottom} onChange={(event) => setVisibleLayers({ ...visibleLayers, bottom: event.target.checked })} />显示底层铜</label></>}</>}
          <div className={styles.separator} /><h3>文件与项目</h3><p className={styles.sideNote}>支持 JSON、KiCad 单页原理图与双层矩形 PCB；器件须在当前库中。分层、铺铜和过孔导入尚未支持。</p>{accountMode && <button className={styles.primaryButton} disabled={busy || !doc.components.length || capabilities?.kicad === false} onClick={() => void exportArchive()}>{busy ? '处理中…' : '导出工程交付包'}</button>}<div className={styles.exportGrid}><button onClick={() => fileRef.current?.click()}><FileUp size={14} /> 导入文件</button><button onClick={() => void exportFile('json')}><Download size={14} /> JSON</button><button onClick={() => void exportFile('sch')}>KiCad 原理图</button><button onClick={() => void exportFile('pcb')}>KiCad PCB</button><button onClick={() => void exportFile('bom')}>BOM CSV</button><button onClick={() => void exportFile('nets')}>网络 CSV</button><button onClick={() => void exportFile('report')}>内部检查报告</button></div><input ref={fileRef} className={styles.visuallyHidden} type="file" accept=".json,.kicad_sch,.kicad_pcb,application/json" onChange={(event) => void importJson(event)} />
          {accountMode && <div className={styles.projectBox}><h3>项目保存</h3><button onClick={() => void loadProjects()} disabled={busy}>刷新项目列表</button><select aria-label="保存到项目" value={projectId} onChange={(event) => { setProjectId(event.target.value); setProjectVersion(null); }}><option value="">选择已有项目</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><div><button disabled={!projectId || busy} onClick={() => void loadProject()}>载入</button><button disabled={!projectId || busy} onClick={() => void saveProject()}>保存版本</button></div><small>保存冲突不会覆盖远端；本地草稿始终保留。</small></div>}
        </div> : <div className={styles.panelBody}><div className={styles.agentIntro}><Sparkles size={18} /><h3>Agent 修改提案</h3><p>Agent 只生成待审阅命令。应用前请核对器件、网络及版本。</p></div>{!accountMode && <p className={styles.sideNote}>本地编辑可直接使用。<a href={apiPath('/login')}>登录平台</a>后可调用 Agent、保存项目及运行 KiCad 检查。</p>}<label className={styles.fieldLabel}>修改要求<textarea aria-label="Agent 修改要求" rows={5} value={prompt} maxLength={4000} placeholder="例如：把 R1 修改为 470 Ω，并在板上整理 LED 位置" onChange={(event) => setPrompt(event.target.value)} /></label><button className={styles.primaryButton} disabled={!accountMode || busy || capabilities?.agent === false} onClick={() => void askAgent()}>{busy ? '请求中…' : '生成修改提案'}</button>{accountMode && capabilities?.agent === false && <p className={styles.sideNote}>当前 Agent 服务未配置或不可用。</p>}{proposal && <div className={styles.proposal}><strong>待审阅提案</strong><p>{proposal.summary}</p><small>模型：{proposal.model} · 基于修订 {proposal.batch.baseRevision}</small><ol>{proposal.batch.commands.map((command, index) => <li key={index}><code>{command.type}</code> {JSON.stringify(command).slice(0, 140)}</li>)}</ol><div><button onClick={() => setProposal(null)}>放弃</button><button className={styles.primaryButton} onClick={() => { if (proposal.batch.baseRevision !== doc.revision) { setError('文档已变化，请重新生成提案'); setProposal(null); return; } apply(proposal.batch.commands, proposal.batch.label, 'agent', proposal.batch); }}>应用提案</button></div></div>}</div>}
      </aside>
    </div>
    <footer className={styles.status}><span className={error ? styles.statusError : styles.statusReady}>{error ? '错误' : '就绪'}</span><span role="status">{error || message}</span><span className={styles.statusRight}>{doc.components.length} 器件 · {doc.nets.length} 网络 · {doc.tracks.length} 走线</span></footer>
    {damaged && <div className={styles.damagedOverlay}><div className={styles.damagedCard}><h2>本地草稿无法读取</h2><p>浏览器中的原始数据没有被覆盖。请先保存原始备份，再选择新建草稿或导入有效 JSON。</p><div><button onClick={() => download('vibehard-damaged-draft.txt', damaged, 'text/plain')}><ArrowDownToLine size={15} /> 下载原始备份</button><button onClick={() => fileRef.current?.click()}>导入文件</button><button className={styles.dangerButton} onClick={() => { if (window.confirm('确认替换损坏的本地草稿？请先下载原始备份。')) { setDamaged(null); setHistory(createHistory(createEmptyDocument())); setError(''); setMessage('已新建空白电路'); } }}>新建空白电路</button></div></div></div>}
  </div>;
}
