"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import { Activity, AlertTriangle, Bot, CheckCircle2, CircleX, Clock3, FolderKanban, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/utils";
import { LlmSettings } from "@/components/app/llm-settings";
import { AdminDesignDiagnostics } from "@/components/app/admin-design-diagnostics";

type Overview = {
  counts: { users: number; projects: number; threads: number; turns: number; activeTurns: number; pendingApprovals: number };
  runners: Array<{ id: string; runnerKey: string; name: string; status: string; capabilities: string[]; lastHeartbeatAt: string | null }>;
  models: Array<{ id: string; providerId: string; model: string; displayName: string; enabled: boolean; capabilities?: string[] }>;
  projects: Array<{ id: string; name: string; workspaceKey: string; runnerKey: string | null; defaultModel: string; userEmail: string; updatedAt: string }>;
  auditLogs: Array<{ id: string; action: string; userEmail: string | null; createdAt: string; metadata: Record<string, unknown> }>;
  users: Array<{ id: string; email: string; name: string; role: string; createdAt: string }>;
};

async function loadOverview() {
  const response = await fetch(apiPath("/api/admin/overview"), { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "管理数据加载失败");
  return data as Overview;
}

const date = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "从未连接";
const statusLabel: Record<string, string> = { online: "在线", busy: "工作中", offline: "离线", revoked: "已撤销" };

export default function AdminPage() {
  const [section, setSection] = useState<"overview" | "models" | "runners" | "users" | "audit" | "diagnostics">("overview");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<Record<string, string>>({});
  const resetPassword = async (userId: string) => {
    const password = passwords[userId] ?? "";
    if (password.length < 8) { setResetMessage((current) => ({ ...current, [userId]: "密码至少需要 8 位" })); return; }
    setResetting(userId); setResetMessage((current) => ({ ...current, [userId]: "" }));
    try {
      const response = await fetch(apiPath(`/api/admin/users/${userId}/reset-password`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "重置失败");
      setPasswords((current) => ({ ...current, [userId]: "" }));
      setResetMessage((current) => ({ ...current, [userId]: "已重置" }));
    } catch (reason) { setResetMessage((current) => ({ ...current, [userId]: reason instanceof Error ? reason.message : "重置失败" })); }
    finally { setResetting(null); }
  };
  const refresh = () => { setLoading(true); setError(""); void loadOverview().then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "管理数据加载失败")).finally(() => setLoading(false)); };
  useEffect(() => {
    let active = true;
    void loadOverview().then((overview) => { if (active) setData(overview); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "管理数据加载失败"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading && !data) return <div className="p-8 text-sm text-muted-foreground">正在加载平台管理数据...</div>;
  if (error && !data) return <div className="mx-auto max-w-5xl p-8"><div className="rounded-lg border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-500"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div></div>;
  if (!data) return null;
  const cards = [["用户", data.counts.users, Users], ["项目", data.counts.projects, FolderKanban], ["会话", data.counts.threads, Bot], ["任务总数", data.counts.turns, Activity], ["运行中", data.counts.activeTurns, Clock3], ["待审批", data.counts.pendingApprovals, ShieldCheck]] as const;
  const sections = [
    { id: "overview", label: "概览", icon: Activity, description: "平台统计与最近项目" },
    { id: "models", label: "模型设置", icon: Bot, description: "配置方案生成与云端 Agent 的模型服务" },
    { id: "runners", label: "Runner 节点", icon: ShieldCheck, description: "执行节点、连接状态与最近心跳" },
    { id: "users", label: "用户管理", icon: Users, description: "查看用户角色与重置密码" },
    { id: "audit", label: "审计日志", icon: Clock3, description: "查看近期平台操作记录" },
    { id: "diagnostics", label: "方案诊断", icon: Activity, description: "定位检索、模型与保存阶段耗时及脱敏错误" },
  ] as const;
  return <div className="mx-auto max-w-7xl p-5 sm:p-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Platform Control</p><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">平台管理</h1><ModuleHelp module="admin" /></div><p className="mt-2 text-sm text-muted-foreground">按功能分区管理平台，点击下方导航切换。</p></div><Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button></div>
    <Link href="/app/knowledge-review" className="mb-5 inline-block text-sm text-primary underline">知识库审核：查看用户入库申请 →</Link>
    {error && <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
    <nav aria-label="管理功能分区" className="mb-5 flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
      {sections.map(({ id, label, icon: Icon }) => <Button key={id} id={`admin-nav-${id}`} type="button" variant={section === id ? "default" : "ghost"} aria-pressed={section === id} aria-controls={`admin-panel-${id}`} onClick={() => setSection(id)} className="shrink-0 gap-2">
        <Icon aria-hidden="true" className="h-4 w-4" />{label}
      </Button>)}
    </nav>
    <p className="mb-5 text-sm text-muted-foreground">{sections.find((item) => item.id === section)?.description}</p>
    {/* Keep panels mounted so switching sections does not discard unsaved settings. */}
    {section === "diagnostics" && <div id="admin-panel-diagnostics" role="region" aria-labelledby="admin-nav-diagnostics"><AdminDesignDiagnostics /></div>}
    <div id="admin-panel-overview" role="region" aria-labelledby="admin-nav-overview" hidden={section !== "overview"}>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-lg border border-border/70 bg-card/50 p-4"><Icon className="mb-4 h-4 w-4 text-primary" /><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</div>
<section className="rounded-lg border border-border/70 bg-card/40"><div className="border-b border-border/70 p-5"><h2 className="font-semibold">最近项目</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">项目</th><th className="px-5 py-3 font-medium">用户</th><th className="px-5 py-3 font-medium">Runner</th><th className="px-5 py-3 font-medium">更新</th></tr></thead><tbody className="divide-y divide-border/60">{data.projects.length === 0 ? <tr><td colSpan={4} className="px-5 py-5 text-muted-foreground">暂无项目</td></tr> : data.projects.map((project) => <tr key={project.id}><td className="max-w-48 truncate px-5 py-3 font-medium">{project.name}</td><td className="max-w-48 truncate px-5 py-3 text-muted-foreground">{project.userEmail}</td><td className="px-5 py-3 font-mono text-xs text-muted-foreground">{project.runnerKey ?? "未绑定"}</td><td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">{date(project.updatedAt)}</td></tr>)}</tbody></table></div></section>
    </div>
    <div id="admin-panel-models" role="region" aria-labelledby="admin-nav-models" hidden={section !== "models"}>
    <LlmSettings onSaved={refresh} />
      <section className="rounded-lg border border-border/70 bg-card/40"><div className="border-b border-border/70 p-5"><h2 className="font-semibold">模型配置</h2><p className="mt-1 text-xs text-muted-foreground">平台当前可选的模型 Profile</p></div><div className="divide-y divide-border/60">{data.models.map((model) => <div key={model.id} className="flex items-center justify-between gap-3 p-5"><div className="min-w-0"><p className="truncate text-sm font-medium">{model.displayName}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{model.providerId} / {model.model}</p></div>{model.enabled ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <CircleX className="h-4 w-4 shrink-0 text-muted-foreground" />}</div>)}</div></section>
    </div>
    <div id="admin-panel-runners" role="region" aria-labelledby="admin-nav-runners" hidden={section !== "runners"}>
      <section className="rounded-lg border border-border/70 bg-card/40"><div className="border-b border-border/70 p-5"><h2 className="font-semibold">Runner 节点</h2><p className="mt-1 text-xs text-muted-foreground">工作区执行环境和最近心跳</p></div><div className="divide-y divide-border/60">{data.runners.length === 0 ? <p className="p-5 text-sm text-muted-foreground">暂无 Runner 注册</p> : data.runners.map((runner) => <div key={runner.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex min-w-0 items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${runner.status === "online" ? "bg-emerald-500" : runner.status === "busy" ? "bg-amber-500" : "bg-muted-foreground/50"}`} /><div className="min-w-0"><p className="truncate text-sm font-medium">{runner.name}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{runner.runnerKey}</p></div></div><div className="text-right text-xs"><p className="font-medium">{statusLabel[runner.status] ?? runner.status}</p><p className="mt-1 text-muted-foreground">心跳 {date(runner.lastHeartbeatAt)}</p></div></div>)}</div></section>
    </div>
    <div id="admin-panel-users" role="region" aria-labelledby="admin-nav-users" hidden={section !== "users"}>
    <section className="rounded-lg border border-border/70 bg-card/40"><div className="border-b border-border/70 p-5"><h2 className="font-semibold">用户与密码重置</h2><p className="mt-1 text-xs text-muted-foreground">为用户设置新的临时密码，密码不会显示在响应或日志中。</p></div><div className="divide-y divide-border/60">{data.users.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-52 flex-1"><p className="text-sm font-medium">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">{user.name} · {user.role} · {date(user.createdAt)}</p></div><input type="password" value={passwords[user.id] ?? ""} onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="新密码（至少 8 位）" className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm" /><Button size="sm" onClick={() => void resetPassword(user.id)} disabled={resetting === user.id}>{resetting === user.id ? "重置中..." : "重置密码"}</Button>{resetMessage[user.id] && <span className="text-xs text-muted-foreground">{resetMessage[user.id]}</span>}</div>)}</div></section>
    </div>
    <div id="admin-panel-audit" role="region" aria-labelledby="admin-nav-audit" hidden={section !== "audit"}>
      <section className="rounded-lg border border-border/70 bg-card/40"><div className="border-b border-border/70 p-5"><h2 className="font-semibold">审计日志</h2></div><div className="divide-y divide-border/60">{data.auditLogs.length === 0 ? <p className="p-5 text-sm text-muted-foreground">暂无审计记录</p> : data.auditLogs.slice(0, 10).map((log) => <div key={log.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-medium">{log.action}</p><time className="shrink-0 text-[10px] text-muted-foreground">{date(log.createdAt)}</time></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{log.userEmail ?? "系统"}</p></div>)}</div></section>
    </div>
  </div>;
}
