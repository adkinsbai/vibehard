"use client";
import { ModuleHelp } from "@/components/app/module-help";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleStop, FolderKanban, Loader2, MessageSquare, Plus, Send, Terminal, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiPath } from "@/lib/utils";
import { conversationMessages } from "@/lib/agent/messages";
import { WorkflowEvidence } from "./workflow-evidence";

type Project = { id: string; name: string; workspaceKey: string; defaultModel: string; runnerKey?: string | null };
type Thread = { id: string; title: string; codexThreadId?: string | null };
type AgentEvent = { eventId: string; sequence: number; type: string; data: Record<string, unknown>; timestamp: string };
type Approval = { id: string; tool: string; risk: string; description: string; details?: Record<string, unknown>; status: string };
type Model = { id: string; providerId: string; model: string; displayName: string; kind: string };
type Artifact = { id: string; name: string; kind: string; path: string };
type Runner = { runnerKey: string; name: string; status: string; capabilities: string[] };
type ThreadOverview = { events: AgentEvent[]; approvals: Approval[]; artifacts: Artifact[] };
type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting";

const EVENT_TYPES = [
  "task.started", "agent.message.delta", "agent.message", "reasoning", "tool.started", "tool.completed",
  "command.output", "file.changed", "approval.requested", "artifact.created", "task.completed", "task.failed", "task.interrupted",
];

async function json<T>(requestPath: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(requestPath), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `请求失败 (${response.status})`);
  return data as T;
}

function approvalFromEvent(event: AgentEvent): Approval {
  return {
    id: String(event.data.approvalId),
    tool: String(event.data.tool ?? "unknown"),
    risk: String(event.data.risk ?? "write"),
    description: String(event.data.description ?? "受限操作"),
    details: event.data,
    status: "pending",
  };
}

function eventText(event: AgentEvent) {
  const direct = event.data.text ?? event.data.input ?? event.data.message;
  if (direct !== undefined) return String(direct);
  const item = event.data.item;
  if (item && typeof item === "object") {
    const typedItem = item as { command?: string; text?: string; type?: string };
    return typedItem.command ?? typedItem.text ?? typedItem.type ?? "";
  }
  return "";
}

export function AgentWorkbench() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [projectId, setProjectId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [input, setInput] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newRunnerKey, setNewRunnerKey] = useState("");
  const [modelProfileId, setModelProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([json<{ projects: Project[] }>("/api/projects"), json<{ models: Model[] }>("/api/models"), json<{ runners: Runner[] }>("/api/runners")])
      .then(([projectResponse, modelResponse, runnerResponse]) => {
        if (!active) return;
        setProjects(projectResponse.projects);
        setModels(modelResponse.models);
        setRunners(runnerResponse.runners);
        setNewRunnerKey(runnerResponse.runners.find((item) => item.runnerKey === "cloud-runner")?.runnerKey ?? runnerResponse.runners[0]?.runnerKey ?? "");
        const requestedProject = new URLSearchParams(window.location.search).get("project");
        const firstProject = projectResponse.projects.find(project => project.id === requestedProject) ?? projectResponse.projects[0];
        setProjectId(firstProject?.id ?? "");
        setModelProfileId(modelResponse.models.find((item) => item.model === firstProject?.defaultModel)?.id ?? modelResponse.models[0]?.id ?? "");
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!projectId) return () => { active = false; };
    void json<{ threads: Thread[] }>(`/api/projects/${projectId}/threads`)
      .then((response) => {
        if (!active) return;
        setThreads(response.threads);
        const firstThreadId = response.threads[0]?.id ?? "";
        setThreadId(firstThreadId);
        setConnection(firstThreadId ? "connecting" : "idle");
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "会话列表加载失败"); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    let source: EventSource | undefined;
    if (!threadId) return () => { active = false; };
    void json<ThreadOverview>(`/api/threads/${threadId}`)
      .then((response) => {
        if (!active) return;
        setEvents(response.events);
        setApprovals(response.approvals.filter((approval) => approval.status === "pending"));
        setArtifacts(response.artifacts);
        const after = response.events.reduce((maximum, event) => Math.max(maximum, event.sequence), -1);
        source = new EventSource(apiPath(`/api/threads/${threadId}/events?after=${after}`));
        source.onopen = () => { if (active) setConnection("connected"); };
        source.onerror = () => { if (active) setConnection("reconnecting"); };
        const receive = (message: MessageEvent) => {
          try {
            const event = JSON.parse(message.data) as AgentEvent;
            setEvents((current) => current.some((item) => item.eventId === event.eventId)
              ? current
              : [...current, event].sort((left, right) => left.sequence - right.sequence));
            if (event.type === "approval.requested") {
              setApprovals((current) => current.some((item) => item.id === String(event.data.approvalId))
                ? current
                : [...current, approvalFromEvent(event)]);
            }
            if (event.type === "artifact.created") {
              void json<ThreadOverview>(`/api/threads/${threadId}`).then((overview) => {
                if (active) setArtifacts(overview.artifacts);
              });
            }
          } catch {
            setError("收到无法解析的 Agent 事件");
          }
        };
        EVENT_TYPES.forEach((type) => source?.addEventListener(type, receive as EventListener));
      })
      .catch((reason) => {
        if (!active) return;
        setConnection("idle");
        setError(reason instanceof Error ? reason.message : "会话加载失败");
      });

    return () => {
      active = false;
      source?.close();
    };
  }, [threadId]);

  const taskState = useMemo(() => {
    const lifecycle = events.filter((event) => ["task.started", "task.completed", "task.failed", "task.interrupted"].includes(event.type)).at(-1)?.type;
    if (lifecycle === "task.started") return "运行中";
    if (lifecycle === "task.completed") return "已完成";
    if (lifecycle === "task.failed") return "失败";
    if (lifecycle === "task.interrupted") return "已中断";
    return "空闲";
  }, [events]);

  const messages = useMemo(
    () => conversationMessages(events),
    [events],
  );

  const resetThreadData = () => {
    setEvents([]);
    setApprovals([]);
    setArtifacts([]);
    setConnection("idle");
  };

  const selectProject = (project: Project) => {
    setProjectId(project.id);
    setThreadId("");
    setThreads([]);
    resetThreadData();
    const defaultProfile = models.find((item) => item.model === project.defaultModel);
    if (defaultProfile) setModelProfileId(defaultProfile.id);
  };

  const selectThread = (nextThreadId: string) => {
    setThreadId(nextThreadId);
    resetThreadData();
    setConnection(nextThreadId ? "connecting" : "idle");
  };

  const createProject = async () => {
    if (!newProject.trim()) return;
    try {
      const slug = newProject.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `project-${Date.now().toString(36)}`;
      const response = await json<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify({ name: newProject, workspaceKey: slug, runnerKey: newRunnerKey || undefined }) });
      setProjects((current) => [response.project, ...current]);
      selectProject(response.project);
      setNewProject("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目创建失败");
    }
  };

  const createThread = async () => {
    if (!projectId) return;
    try {
      const response = await json<{ thread: Thread }>(`/api/projects/${projectId}/threads`, { method: "POST" });
      setThreads((current) => [response.thread, ...current]);
      selectThread(response.thread.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "会话创建失败");
    }
  };

  const send = async () => {
    const profile = models.find((item) => item.id === modelProfileId);
    if (sending || taskState === "运行中" || !threadId || !input.trim() || !profile) return;
    setSending(true);
    setError("");
    try {
      await json(`/api/threads/${threadId}/turns`, {
        method: "POST",
        body: JSON.stringify({ input, model: profile.model, providerId: profile.providerId }),
      });
      setInput("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务提交失败");
    } finally {
      setSending(false);
    }
  };

  const refreshModels = async () => {
    try {
      const response = await json<{ models: Model[] }>("/api/models");
      setModels(response.models);
      setModelProfileId(response.models[0]?.id ?? "");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "模型列表刷新失败"); }
  };

  const downloadProject = async () => {
    if (!projectId || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(apiPath(`/api/projects/${projectId}/download`));
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "工程下载失败");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `vibehard-${projectId}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "工程下载失败"); }
    finally { setDownloading(false); }
  };

  const decide = async (approvalId: string, decision: "approve" | "reject") => {
    if (deciding.includes(approvalId)) return;
    setDeciding((current) => [...current, approvalId]);
    try {
      await json(`/api/approvals/${approvalId}/decision`, { method: "POST", body: JSON.stringify({ decision }) });
      setApprovals((current) => current.filter((item) => item.id !== approvalId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审批失败");
    } finally {
      setDeciding((current) => current.filter((item) => item !== approvalId));
    }
  };

  const interrupt = async () => {
    if (!threadId) return;
    try {
      const response = await json<{ interrupted: boolean }>(`/api/threads/${threadId}/interrupt`, { method: "POST" });
      if (!response.interrupted) setError("当前会话没有正在运行的任务");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "中断失败");
    }
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">正在连接 Agent 平台...</div>;

  const connectionLabel = connection === "connected" ? "事件已连接" : connection === "reconnecting" ? "正在重连" : connection === "connecting" ? "正在连接" : "未连接";
  const connectionColor = connection === "connected" ? "bg-emerald-500" : connection === "idle" ? "bg-muted-foreground" : "bg-amber-500";

  return <div className="grid min-h-full gap-0 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
    <aside className="border-r border-border/70 bg-card/40 p-4">
      <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-1"><h1 className="text-sm font-semibold">Agent 项目</h1><ModuleHelp module="agent" /></div><Button size="icon" variant="ghost" className="h-7 w-7" title="新建项目" onClick={createProject}><Plus className="h-4 w-4" /></Button></div>
      <div className="mb-2 flex gap-2"><Input value={newProject} onChange={(event) => setNewProject(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createProject()} placeholder="项目名称" className="h-8 text-xs" /></div>
      <select aria-label="项目执行器" value={newRunnerKey} onChange={(event) => setNewRunnerKey(event.target.value)} className="mb-3 h-8 w-full rounded-md border border-border bg-background px-2 text-xs" disabled={!runners.length}><option value="">暂无可用执行器</option>{runners.map((runner) => <option key={runner.runnerKey} value={runner.runnerKey}>{runner.name}{runner.capabilities.includes("usb-device") ? " · USB 设备" : " · 云端"}</option>)}</select>
      <div className="space-y-1">{projects.map((project) => <button key={project.id} onClick={() => selectProject(project)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${project.id === projectId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><FolderKanban className="h-4 w-4" /><span className="truncate">{project.name}</span></button>)}</div>
      {projectId && <Link href={`/app/agent/${projectId}/knowledge`} className="mt-3 block rounded-md border p-2 text-center text-sm text-primary">项目知识库 · 审核与版本</Link>}
      {projectId && <Link href={`/app/agent/${projectId}/designs`} className="mt-2 block rounded-md border p-2 text-center text-sm text-primary">方案记录 · 进度与下载</Link>}
      {projects.length === 0 && <p className="text-xs text-muted-foreground">还没有项目</p>}
    </aside>

    <section className="flex min-h-[620px] min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2"><MessageSquare className="h-4 w-4 shrink-0 text-primary" /><select value={threadId} onChange={(event) => selectThread(event.target.value)} className="min-w-0 max-w-56 bg-transparent text-sm font-medium outline-none" disabled={!threads.length}><option value="">选择会话</option>{threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}</select><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="新建会话" onClick={createThread} disabled={!projectId}><Plus className="h-4 w-4" /></Button></div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${connectionColor}`} /><span>{connectionLabel}</span><span className="border-l border-border pl-2">{taskState}</span><Button size="icon" variant="ghost" className="h-7 w-7" title="中断当前任务" onClick={interrupt} disabled={!threadId}><CircleStop className="h-4 w-4" /></Button><select value={modelProfileId} onChange={(event) => setModelProfileId(event.target.value)} className="max-w-48 rounded-md border border-border bg-background px-2 py-1 text-xs" disabled={!models.length}>{models.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></div>
      </div>
      <div className="flex justify-end border-b border-border/40 px-5 py-1"><button onClick={() => void refreshModels()} className="text-xs text-primary hover:underline">刷新模型列表</button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 && <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-sm text-muted-foreground"><Terminal className="mb-3 h-8 w-8 text-primary/60" /><p>选择项目并发送第一个 Agent 任务</p></div>}
        {messages.map((event) => <div key={event.eventId} className={`rounded-md border p-3 text-sm ${event.type === "command.output" ? "border-border/60 bg-muted/40 font-mono text-xs" : "border-border/70 bg-card"}`}><div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground"><Wrench className="h-3 w-3" />{event.type}</div><p className="whitespace-pre-wrap break-words leading-6">{eventText(event)}</p><WorkflowEvidence data={event.data} /></div>)}
      </div>
      <div className="border-t border-border/70 p-4"><Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send(); }} placeholder="描述要交给 Agent 的任务..." className="min-h-[90px] resize-none" /><div className="mt-2 flex items-center justify-end"><Button onClick={send} disabled={sending || !threadId || !input.trim() || !modelProfileId} className="gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "提交中" : "发送任务"}</Button></div></div>
    </section>

    <aside className="border-l border-border/70 bg-card/30 p-4">
      <div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-muted-foreground">审批队列</span>{approvals.length > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">{approvals.length}</span>}</div>
      {error && <div className="mb-3 flex gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button className="ml-auto" onClick={() => setError("")} title="关闭"><X className="h-3 w-3" /></button></div>}
      {approvals.length === 0 ? <p className="text-xs leading-5 text-muted-foreground">当前没有待审批操作</p> : <div className="space-y-3">{approvals.map((approval) => {
        const details = approval.details ?? {};
        const pending = deciding.includes(approval.id);
        return <div key={approval.id} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><div className="min-w-0"><p className="text-xs font-semibold text-foreground">{approval.risk === "write" ? "写入工作区" : "执行命令"}</p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{approval.description}</p>{details.command !== undefined && <p className="mt-2 break-all rounded bg-muted p-2 font-mono text-[10px]">{String(details.command)}</p>}{details.cwd !== undefined && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">目录: {String(details.cwd)}</p>}{details.targetPath !== undefined && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">路径: {String(details.targetPath)}</p>}</div></div><div className="mt-3 flex gap-2"><Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={() => void decide(approval.id, "approve")} disabled={pending}>{pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}允许</Button><Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => void decide(approval.id, "reject")} disabled={pending}><CircleStop className="h-3 w-3" />拒绝</Button></div></div>;
      })}</div>}
      <div className="my-5 border-t border-border/70" /><div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase text-muted-foreground">产物</p><Button variant="outline" size="sm" disabled={!projectId || downloading} onClick={() => void downloadProject()}>{downloading ? "打包中…" : "下载工程"}</Button></div>{artifacts.length === 0 ? <p className="text-xs text-muted-foreground">暂无产物</p> : <div className="space-y-2">{artifacts.map((artifact) => <div key={artifact.id} className="rounded-md border border-border/70 p-2"><p className="truncate text-xs font-medium">{artifact.name}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{artifact.path}</p></div>)}</div>}
    </aside>
  </div>;
}
