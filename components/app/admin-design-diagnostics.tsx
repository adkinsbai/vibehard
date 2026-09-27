"use client";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/utils";
import type { DesignDiagnostics as Diagnostics } from "@/lib/agent/design-diagnostics";
import { DesignDiagnostics } from "./design-diagnostics";

export function AdminDesignDiagnostics() {
  const [jobs, setJobs] = useState<Array<{ id: string; status: string; diagnostics: Diagnostics | null }>>([]);
  const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath("/api/admin/design-diagnostics"), { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("诊断读取失败或没有管理员权限");
      return response.json();
    }).then(data => { setJobs(data.jobs); setError(""); }).catch(() => { if (!controller.signal.aborted) setError("诊断读取失败，请刷新重试"); });
    return () => controller.abort();
  }, [revision]);
  return <section className="rounded-lg border bg-card p-5"><div className="flex justify-between"><h2>最近 50 个方案任务 · 脱敏诊断</h2><button className="text-primary" onClick={() => setRevision(x => x + 1)}>刷新诊断</button></div>
    <p className="my-2 text-xs text-muted-foreground">仅展示阶段、耗时、错误码与模型版本，不包含需求正文、模型原始响应或密钥。</p>
    {error && <p role="alert">{error}</p>}{jobs.map(job => <article key={job.id} className="mt-4"><p className="break-all text-xs">{job.id} · {job.status}</p><DesignDiagnostics value={job.diagnostics} admin /></article>)}
  </section>;
}
