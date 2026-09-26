'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Send, RotateCcw } from 'lucide-react';
import { createEmptyDocument } from '@/lib/eda/document';
import { applyEditBatch } from '@/lib/eda/commands';
import { exportKicadPcb, exportKicadSchematic } from '@/lib/eda/kicad';
import { importNativeSchematic } from '@/lib/eda/kicad-import';
import type { EditBatch, EditCommand, EdaDocument } from '@/lib/eda/types';
import { apiPath } from '@/lib/utils';
import styles from './agent-panel.module.css';

type Entry = { role: 'user' | 'agent'; text: string };
type Proposal = { summary: string; model: string; batch: EditBatch; document: EdaDocument };
type Capability = { agent: boolean };
type Sources = { schematic: string; pcb: string };

function describeCommand(command: EditCommand, before: EdaDocument, after: EdaDocument): string {
  const reference = (id: string) => before.components.find(part => part.id === id)?.ref ?? after.components.find(part => part.id === id)?.ref ?? id;
  const pin = (node: { componentId: string; pinId: string }) => `${reference(node.componentId)}.${node.pinId}`;
  switch (command.type) {
    case 'addComponent': return `添加 ${command.component.ref} · ${command.component.value}`;
    case 'removeComponent': return `删除 ${reference(command.id)}`;
    case 'moveComponent': return `移动 ${reference(command.id)} 的${command.view === 'pcb' ? 'PCB' : '原理图'}位置到 (${command.x}, ${command.y}) mm`;
    case 'setComponent': return `修改 ${reference(command.id)}：${Object.entries(command.changes).map(([key, value]) => `${key}=${value}`).join('，')}`;
    case 'connectPins': return `连接 ${pin(command.a)} ↔ ${pin(command.b)}${command.netName ? ` · ${command.netName}` : ''}`;
    case 'disconnectPin': return `断开 ${pin(command.pin)}`;
    case 'renameNet': return `网络 ${command.id} 改名为 ${command.name}`;
    case 'addTrack': return `添加 ${command.track.layer === 'top' ? '顶层' : '底层'} PCB 走线 · ${command.track.points.length} 个点`;
    case 'removeTrack': return `删除 PCB 走线 ${command.id}`;
    case 'setBoard': return `设置 PCB 尺寸为 ${command.width} × ${command.height} mm`;
    case 'renameDocument': return `电路改名为 ${command.name}`;
  }
}

export function AgentPanel({ onCreate, currentProjectId }: { onCreate: (sources: Sources, title: string) => Promise<void>; currentProjectId?: string }) {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('AI 原理图');
  const [history, setHistory] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<EdaDocument | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshCapability = async () => {
    const response = await fetch(apiPath('/api/eda/capabilities'), { cache: 'no-store' });
    if (response.status === 401) { setCapability({ agent: false }); return; }
    if (!response.ok) throw new Error('无法检查 Agent 服务状态');
    setCapability(await response.json());
  };
  useEffect(() => { let active = true; void fetch(apiPath('/api/eda/capabilities'), { cache: 'no-store' }).then(async response => {
    if (active) setCapability(response.ok ? await response.json() : { agent: false });
  }).catch(() => { if (active) setCapability({ agent: false }); }); return () => { active = false; }; }, []);

  const ask = async () => {
    const request = prompt.trim();
    if (request.length < 2 || !capability?.agent || busy || proposal) return;
    setBusy(true); setError('');
    try {
      const base = draft ?? createEmptyDocument();
      const prior = history.slice(-6).map(item => `${item.role === 'user' ? '用户' : 'Agent'}：${item.text.slice(0, 500)}`).join('\n');
      const response = await fetch(apiPath('/api/eda/agent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: base, prompt: `${prior ? `前文：\n${prior}\n` : ''}本次要求：${request}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Agent 请求失败 (${response.status})`);
      const candidate = applyEditBatch(base, data.batch);
      setHistory(current => [...current, { role: 'user', text: request }, { role: 'agent', text: data.summary }]);
      setProposal({ summary: data.summary, model: data.model, batch: data.batch, document: candidate });
      setPrompt('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Agent 生成失败'); }
    finally { setBusy(false); }
  };
  const accept = () => {
    if (!proposal) return;
    setDraft(proposal.document); setProposal(null);
  };
  const create = async () => {
    if (!draft || !draft.components.length || busy) return;
    setBusy(true); setError('');
    try {
      await onCreate({ schematic: exportKicadSchematic(draft), pcb: exportKicadPcb(draft) }, title.trim());
      setHistory(current => [...current, { role: 'agent', text: '已创建并打开原生 KiCad 工程。后续新要求会作为新设计草稿，不会直接覆盖正在编辑的文件。' }]);
      setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建原生工程失败'); }
    finally { setBusy(false); }
  };
  const loadSaved = async () => {
    if (!currentProjectId || busy) return;
    if ((draft || proposal) && !window.confirm('用当前工程已保存的原理图替换设计草稿？当前 KiCad 工程不会改动。')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(apiPath(`/api/eda/desktop/${currentProjectId}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'snapshot' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `读取原理图失败 (${response.status})`);
      const document = importNativeSchematic(data.schematic, data.netlist);
      setDraft(document); setProposal(null);
      setTitle(document.name.slice(0, 80));
      setHistory(current => [...current, { role: 'agent', text: '已读取当前工程的已保存原理图。接下来会在新草稿中修改；创建工程时会生成新 PCB，不覆盖原工程。' }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '当前原理图不能安全读取，草稿没有变化'); }
    finally { setBusy(false); }
  };
  const reset = () => {
    if ((history.length || draft || proposal) && !window.confirm('清空当前 Agent 对话与尚未创建的设计草稿？已创建的 KiCad 工程不会删除。')) return;
    setHistory([]); setDraft(null); setProposal(null); setPrompt(''); setError('');
  };
  const preview = proposal?.document ?? draft;

  return <aside className={styles.panel} aria-label="AI 原理图 Agent">
    <div className={styles.heading}><div><Sparkles size={18} /><strong>原理图 Agent</strong></div><button aria-label="新对话" title="新对话" onClick={reset}><RotateCcw size={15} /></button></div>
    <p className={styles.intro}>描述电路需求，Agent 生成可审阅的器件与连接；确认后创建并打开新的 KiCad 工程。</p>
    <div className={styles.capability}>{capability === null ? '正在检查模型…' : capability.agent ? '● 设计模型已接入' : '○ 设计模型未配置'} <button onClick={() => void refreshCapability().catch(() => setCapability({ agent: false }))}>刷新</button></div>
    {capability?.agent === false && <p className={styles.modelHelp}>请管理员到<a href={apiPath('/app/admin')}>模型设置</a>配置“设计模型”，完成后点刷新。</p>}
    <button disabled={!currentProjectId || busy} onClick={() => void loadSaved()}>读取当前已保存原理图</button>
    <div className={styles.thread} role="log" aria-label="Agent 对话">
      {!history.length && <div className={styles.welcome}>可以说：“画一个带限流电阻和 LED 的电路，并标出电源接口。”当前器件库支持官方 KiCad 的 7 类器件。</div>}
      {history.map((entry, index) => <div key={index} className={`${styles.bubble} ${entry.role === 'user' ? styles.user : styles.agent}`}><small>{entry.role === 'user' ? '你' : 'Agent'}</small><p>{entry.text}</p></div>)}
      {busy && <div className={styles.thinking}>正在处理，请稍候…</div>}
    </div>
    {proposal && <section className={styles.proposal} aria-label="待审阅修改"><strong>待审阅修改</strong><span>{proposal.model} · {proposal.batch.commands.length} 项修改</span><p>{proposal.summary}</p><ol className={styles.commandList}>{proposal.batch.commands.map((command, index) => <li key={index}>{describeCommand(command, draft ?? createEmptyDocument(), proposal.document)}</li>)}</ol><div className={styles.actions}><button onClick={() => setProposal(null)}>放弃</button><button className={styles.primary} onClick={accept}>加入设计草稿</button></div></section>}
    {preview && <section className={styles.preview} aria-label="设计草稿"><strong>设计草稿</strong><span>{preview.components.length} 个器件 · {preview.nets.length} 个网络</span><ul>{preview.components.slice(0, 18).map(item => <li key={item.id}>{item.ref} · {item.value}</li>)}</ul>{preview.components.length > 18 && <small>另有 {preview.components.length - 18} 个器件</small>}{preview.nets.length > 0 && <small>网络：{preview.nets.slice(0, 8).map(net => net.name).join('、')}</small>}</section>}
    {draft && !proposal && <div className={styles.create}><label>新工程名称<input aria-label="Agent 新工程名称" value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></label><button className={styles.primary} disabled={busy || !draft.components.length || title.trim().length < 2} onClick={() => void create()}>创建并打开 KiCad 工程</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.composer}><label htmlFor="eda-agent-request">向 Agent 描述电路</label><textarea id="eda-agent-request" aria-label="向 Agent 描述电路" placeholder="你希望画什么原理图？请写明器件、供电、电气连接和约束。" maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} /><button className={styles.primary} disabled={busy || !capability?.agent || Boolean(proposal) || prompt.trim().length < 2} onClick={() => void ask()}><Send size={15} />生成修改提案</button>{proposal && <small>先审阅并处理当前提案，再继续对话。</small>}</div>
    <p className={styles.boundary}>可从空白草稿开始，或只读当前工程已保存的单页原理图。读取仅支持已验证的器件库与结构；新工程的 PCB 会重新生成。Agent 不覆盖当前文件。生成结果仍需检查 ERC、器件参数和硬件约束。</p>
  </aside>;
}
