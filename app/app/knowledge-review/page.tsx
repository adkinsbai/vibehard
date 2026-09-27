"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/utils";

type ReviewPage = { projects: { id: string; name: string; documents: { id: string; title: string; pending: boolean; rejected: boolean; publishedVersion: number | null }[] }[]; nextCursor: string | null };

export default function KnowledgeReviewPage() {
  const [data, setData] = useState<ReviewPage | null>(null);
  const [cursor, setCursor] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setData(null); setError("");
      try {
        const response = await fetch(apiPath(`/api/knowledge/review${cursor ? `?after=${cursor}` : ""}`), { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "读取审核列表失败");
        if (!controller.signal.aborted) setData(body);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [cursor, refresh]);
  const visible = data?.projects.flatMap(project => project.documents.filter(doc => !pendingOnly || doc.pending).map(doc => ({ project, doc }))) ?? [];
  return <div className="mx-auto max-w-5xl space-y-5 p-5 md:p-8">
    <header className="space-y-2"><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">知识库审核</h1><ModuleHelp module="review" /></div><p className="text-sm text-muted-foreground">仅管理员和开发者可审核跨项目的知识申请。审核权限不包含他人的工程文件、聊天记录或平台模型设置。</p></header>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={loading} onClick={() => { setCursor(undefined); setRefresh(value => value + 1); }}>刷新并返回首页</Button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />只看待审核</label>
    </div>
    {error && <p role="alert" className="rounded border p-3 text-destructive">{error}</p>}
    {loading ? <p>加载中…</p> : data && <>
      {!visible.length && <p className="text-sm text-muted-foreground">本页没有符合条件的资料。若有下一页，请继续查看。</p>}
      <div className="space-y-3">{visible.map(({ project, doc }) => <article key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div><h2 className="font-medium">{doc.title}</h2><p className="mt-1 text-sm text-muted-foreground">项目：{project.name} · {doc.pending ? "待审核" : doc.rejected ? "已退回" : "已审核"}{doc.publishedVersion ? ` · 正式 v${doc.publishedVersion}` : " · 无生效版本"}</p></div>
        <Link className="text-sm text-primary underline" href={`/app/agent/${project.id}/knowledge?document=${doc.id}`}>查看资料与审核</Link>
      </article>)}</div>
      <p className="text-xs text-muted-foreground">每页最多 10 个项目；默认只展示本页待审核资料。</p>
      {data.nextCursor && <Button variant="outline" onClick={() => setCursor(data.nextCursor!)}>下一页</Button>}
    </>}
  </div>;
}
