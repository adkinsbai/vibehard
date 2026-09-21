"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layers, Loader2 } from "lucide-react";
import { PageHeader } from "./page-header";
import { DesignResult } from "./design-result";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPath } from "@/lib/utils";
import { designStatus, type DesignJob, type DesignJobInput, type DesignJobSummary } from "@/lib/agent/design-jobs";

type Project = { id: string; name: string };
type Listing = { jobs: DesignJobSummary[]; nextOffset: number | null };
const example = "做一个电池供电的温湿度 + 光照监测节点，带小屏幕显示，Wi-Fi 上报数据，支持 USB 充电。";
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data;
}
export function DesignWorkbench({ projectId }: { projectId?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [target, setTarget] = useState(projectId ?? "");
  const [requirement, setRequirement] = useState("");
  const [jobs, setJobs] = useState<DesignJobSummary[]>([]);
  const [selected, setSelected] = useState<DesignJob | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  // Keep this key on an ambiguous network failure, so retry cannot create a second project.
  const pending = useRef<DesignJobInput | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const listPath = `/api/design${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`;

  useEffect(() => {
    let active = true;
    void Promise.all([json<{ projects: Project[] }>("/api/projects"), json<Listing>(listPath)])
      .then(([p, list]) => {
        if (!active) return;
        setProjects(p.projects); setJobs(list.jobs); setNextOffset(list.nextOffset);
        if (projectId && !p.projects.some(project => project.id === projectId)) throw new Error("项目不存在或无权访问");
        setSelectedId(current => current || list.jobs[0]?.id || ""); setError("");
      }).catch(reason => { if (active) setError(reason.message ?? "读取方案失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [listPath, projectId, refresh]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const { job } = await json<{ job: DesignJob }>(`/api/design/${selectedId}`);
        if (!active) return;
        setSelected(job); setPollError("");
        setJobs(current => current.map(item => item.id === job.id ? job : item));
        if (job.status === "queued" || job.status === "running") timer = setTimeout(poll, 3000);
      } catch {
        if (active) {
          setPollError("暂时无法获取进度，已保存的任务不受影响；正在重新连接。可刷新页面或稍后从项目查看。");
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [selectedId, refresh]);

  async function submit(text = requirement, existingProject = target) {
    if (submitting.current || text.trim().length < 2) return;
    submitting.current = true; setSending(true); setError("");
    const body = { requirement: text.trim(), ...(existingProject ? { projectId: existingProject } : {}) };
    if (!pending.current || pending.current.requirement !== body.requirement || pending.current.projectId !== body.projectId) pending.current = { ...body, requestId: crypto.randomUUID() };
    try {
      const { job } = await json<{ job: DesignJob }>("/api/design", { method: "POST", body: JSON.stringify(pending.current) });
      pending.current = null;
      if (!mounted.current) return;
      setSelected(job); setSelectedId(job.id); setTarget(job.projectId); setRequirement(job.requirement);
      setProjects(current => current.some(p => p.id === job.projectId) ? current : [{ id: job.projectId, name: job.projectName }, ...current]);
      setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
      setRefresh(value => value + 1);
    } catch (reason) {
      if (mounted.current) setError(`${reason instanceof Error ? reason.message : "提交失败"}。若连接中断，可原样重试或刷新查看记录，不会重复创建相同提交。`);
    } finally { submitting.current = false; if (mounted.current) setSending(false); }
  }
  async function more() {
    if (nextOffset === null) return;
    try {
      const list = await json<Listing>(`${listPath}${projectId ? "&" : "?"}offset=${nextOffset}`);
      setJobs(current => [...current, ...list.jobs.filter(job => !current.some(item => item.id === job.id))]); setNextOffset(list.nextOffset);
    } catch { setError("更多方案读取失败，请重试"); }
  }
  const activeJob = jobs.find(job => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!activeJob || activeJob.id === selectedId) return;
    const timer = setInterval(() => setRefresh(value => value + 1), 5000);
    return () => clearInterval(timer);
  }, [activeJob, selectedId]);
  const validProject = !projectId || projects.some(project => project.id === projectId);
  return <div className="p-6 lg:p-8">
    <PageHeader helpKey="design" icon={Layers} title={projectId ? "项目方案记录" : "硬件方案生成"} description="需求先保存到 Agent 项目，再由云端后台生成；离开页面不影响任务" />
    <div className="rounded-xl border bg-card p-5">
      <label htmlFor="design-project" className="mb-2 block text-sm font-semibold">保存到项目</label>
      <select id="design-project" value={target} disabled={Boolean(projectId) || sending || loading} onChange={e => setTarget(e.target.value)} className="mb-4 w-full rounded-md border bg-background p-2 text-sm">
        {!projectId && <option value="">自动新建 Agent 项目</option>}{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <div className="mb-3 flex items-center justify-between"><label htmlFor="requirement" className="text-sm font-semibold">功能需求</label><button disabled={sending} onClick={() => setRequirement(example)} className="text-xs text-primary">填入示例</button></div>
      <Textarea id="requirement" value={requirement} disabled={sending} maxLength={12000} onChange={e => setRequirement(e.target.value)} placeholder="描述功能、供电、通信、尺寸等约束..." className="min-h-[140px]" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">已接入内置方案知识库，BOM 将自动填写人民币参考单价。</span><Button onClick={() => void submit()} disabled={loading || !validProject || sending || requirement.trim().length < 2 || Boolean(activeJob)}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{sending ? "保存需求中…" : "生成方案"}</Button></div>
      {activeJob && <p className="mt-3 text-sm">已有方案{designStatus[activeJob.status]}。<button className="text-primary underline" onClick={() => { setSelected(null); setSelectedId(activeJob.id); setRefresh(value => value + 1); }}>查看进度</button>，可安全离开本页。</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">已保存的方案任务</h2><button className="text-sm text-primary" onClick={() => setRefresh(value => value + 1)}>刷新记录</button></div>
      {loading ? <p>正在读取记录…</p> : jobs.length === 0 && <p className="text-sm text-muted-foreground">暂无方案记录。提交后会立即保存需求。</p>}
      <div className="flex flex-wrap gap-2">{jobs.map(job => <button key={job.id} aria-pressed={selectedId === job.id} onClick={() => { setSelected(null); setSelectedId(job.id); setRefresh(value => value + 1); }} className={`max-w-full rounded-md border p-2 text-left text-sm ${selectedId === job.id ? "border-primary bg-primary/5" : ""}`}><span className="block truncate">{job.projectName} · {designStatus[job.status]}</span><span className="text-xs text-muted-foreground">{job.requirement.slice(0, 45)} · {new Date(job.createdAt).toLocaleString("zh-CN")}</span></button>)}</div>
      {nextOffset !== null && <button onClick={() => void more()} className="mt-3 text-sm text-primary">加载更多记录</button>}
      {pollError && <p role="alert" className="mt-3 text-sm text-amber-600">{pollError}</p>}
      {selected && selected.id === selectedId && <div className="mt-4 border-t pt-4">
        <p role="status" className="font-semibold">{designStatus[selected.status]} · {selected.projectName}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">已保存需求：{selected.requirement}</p>
        {(selected.status === "queued" || selected.status === "running") && <p className="mt-2 text-sm text-muted-foreground">{selected.status === "queued" ? "等待后台处理，排队最多 10 分钟。" : "正在请求模型，单次最多 90 秒；异常执行最迟 2 分钟标记失败。"} 刷新或离开后可从项目方案记录继续查看。</p>}
        {selected.error && <p role="alert" className="mt-2 text-sm text-red-500">{selected.error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm"><Link className="text-primary underline" href={`/app/agent?project=${selected.projectId}`}>进入 Agent 项目</Link><Link className="text-primary underline" href={`/app/agent/${selected.projectId}/designs`}>项目全部方案</Link>
          {selected.status === "failed" && <Button variant="outline" disabled={sending || Boolean(activeJob)} onClick={() => void submit(selected.requirement, selected.projectId)}>在原项目重试</Button>}
          {selected.status === "completed" && <a className="text-primary underline" href={apiPath(`/api/design/${selected.id}/download`)}>下载方案 Markdown</a>}
        </div>
        {selected.model && <p className="mt-2 text-xs text-muted-foreground">模型：{selected.model} · 内置规则版本：{selected.knowledgeVersion}</p>}
        {selected.result && <DesignResult result={selected.result} />}
      </div>}
    </section>
  </div>;
}
