"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cpu, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/utils";
import { SCHEMATIC_FILE_LIMIT, schematicResultSchema, type SchematicResult } from "@/lib/agent/schematic";

export default function SchematicPage() {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<SchematicResult | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectLoading, setProjectLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ projectId: string; documentId: string } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const submission = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); submission.current?.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(apiPath("/api/projects"), { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "无法读取项目列表");
        if (!controller.signal.aborted) setProjects(body.projects);
      } catch (cause) { if (!controller.signal.aborted) setProjectError(cause instanceof Error ? cause.message : "读取项目失败"); }
      finally { if (!controller.signal.aborted) setProjectLoading(false); }
    })();
    return () => controller.abort();
  }, [reload]);
  function reloadProjects() { setProjectLoading(true); setProjectError(""); setReload(n => n + 1); }
  function selectFile(next?: File) {
    if (active.current || submission.current) return;
    setResult(null); setSubmitted(null); setError(""); setConsent(false);
    if (!next) { setFile(null); return; }
    if (!/\.(png|jpe?g|pdf)$/i.test(next.name) || !next.size || next.size > SCHEMATIC_FILE_LIMIT) {
      setFile(null); setError("请选择不超过 5 MB 的 PNG / JPG / PDF 文件"); return;
    }
    setFile(next);
  }
  async function analyze() {
    if (!file || !consent || active.current || submission.current) return;
    const controller = new AbortController(); active.current = controller;
    setAnalyzing(true); setResult(null); setSubmitted(null); setError(""); setStatus("正在上传并连接模型…");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(apiPath("/api/schematic"), { method: "POST", body: form, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(110_000)]) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "识别请求失败"); }
      if (!response.body) throw new Error("服务器未返回识别内容");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed: SchematicResult | null = null;
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "status") setStatus(event.message);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "result") completed = schematicResultSchema.parse(event.result);
        }
        if (done) break;
      }
      if (!completed) throw new Error("连接中断，未收到完整结果；未提交任何知识库申请");
      setResult(completed);
    } catch (cause) { setError(controller.signal.aborted ? "已取消识别" : cause instanceof Error ? cause.message : "识别失败"); }
    finally { controller.abort(); active.current = null; setAnalyzing(false); setStatus(""); }
  }
  async function submit() {
    if (!result || !projectId || submission.current || active.current || submitted) return;
    const controller = new AbortController(); submission.current = controller;
    setSubmitting(true); setError("");
    try {
      const response = await fetch(apiPath(`/api/projects/${projectId}/knowledge`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", submissionId: result.analysisId, draft: result.draft }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "提交失败");
      if (!body.documents?.some((doc: { id: string }) => doc.id === result.analysisId)) throw new Error("服务器未确认资料保存");
      setSubmitted({ projectId, documentId: result.analysisId });
    } catch (cause) { if (!controller.signal.aborted) setError(`${cause instanceof Error ? cause.message : "提交失败"}。若网络中断可重试同一申请，不会重复创建或自动发布。`); }
    finally { submission.current = null; setSubmitting(false); }
  }
  function download() {
    if (!result) return;
    const text = `# ${result.draft.title}\n\n来源：${result.draft.source}\n\n${result.draft.content}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "原理图识别-待审核.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="mx-auto max-w-6xl space-y-5 p-6 lg:p-8">
    <PageHeader helpKey="schematic" icon={Cpu} title="原理图识别" description="上传图纸 → 模型识别 → 申请加入项目知识库备选 → 管理员或开发者审核发布" />
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <label className="block space-y-2 text-sm font-medium"><span>上传原理图</span><input aria-label="上传原理图" type="file" accept=".png,.jpg,.jpeg,.pdf" disabled={analyzing || submitting} onChange={event => selectFile(event.target.files?.[0])} className="block w-full rounded border p-4" /></label>
      <p className="text-xs text-muted-foreground">PNG / JPG / PDF，单个文件最多 5 MB。复杂图纸建议按页拆分，保持网络标签和引脚清晰。原文件不在平台持久保存，请自行保留供审核对照。</p>
      {file && <p className="text-sm">当前文件：{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={analyzing || submitting} onChange={event => setConsent(event.target.checked)} />我有权处理此图纸，同意将文件发送给管理员配置的模型服务进行识别。</label>
      <p className="text-xs text-muted-foreground">暂共用管理台「硬件方案生成」模型配置，服务商和模型需支持图片/PDF 输入；失败会明确报错，不生成示例替代结果。</p>
      <div className="flex justify-end gap-2">{analyzing && <Button variant="outline" onClick={() => active.current?.abort()}>取消识别</Button>}<Button onClick={() => void analyze()} disabled={!file || !consent || analyzing || submitting}>{analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{analyzing ? "识别中…" : "开始识别"}</Button></div>
      {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
    </section>
    {error && <p role="alert" className="rounded border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {result && <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">识别结果 · 待审核</h2><p className="mt-1 text-sm text-muted-foreground">{result.draft.title} · {result.model} · {new Date(result.generatedAt).toLocaleString("zh-CN")}</p></div><Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />下载识别文档 MD</Button></div>
      <p className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">AI 识别可能误读。申请只进入备选（待审核草稿），审核发布前 Agent 不会使用；不代表已通过电气或实机验证。</p>
      <details><summary className="cursor-pointer text-sm">原文件与识别来源</summary><p className="mt-2 break-all text-xs text-muted-foreground">{result.draft.source}</p></details>
      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-4 text-sm leading-6">{result.draft.content}</pre>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">申请推送到知识库备选</h3>
        <p className="text-sm text-muted-foreground">选择你拥有的目标项目。只保存这份识别文档，不发布、不上传到其他项目或全平台公共库。</p>
        {projectError && <div role="alert" className="text-sm text-destructive">{projectError} <Button variant="outline" size="sm" onClick={reloadProjects}>重试读取项目</Button></div>}
        {projectLoading ? <p className="text-sm">加载项目中…</p> : !projectError && !projects.length ? <p className="text-sm">你还没有项目，请先到 <Link className="text-primary underline" href="/app/agent">Agent 项目创建项目</Link>，返回后 <button className="text-primary underline" onClick={reloadProjects}>刷新项目列表</button>。</p> : null}
        <label className="block space-y-1 text-sm"><span>目标项目</span><select value={projectId} disabled={submitting || !!submitted || projectLoading} onChange={event => setProjectId(event.target.value)} className="block w-full rounded border bg-background p-2"><option value="">请选择目标项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <Button disabled={!projectId || projectLoading || !!projectError || submitting || !!submitted} onClick={() => void submit()}>{submitting ? "正在提交申请…" : submitted ? "已加入备选" : "申请加入知识库备选"}</Button>
        {submitted && <div role="status" className="rounded border border-primary/30 bg-primary/5 p-3 text-sm"><p>已提交到所选项目的待审核列表，等待管理员或开发者审核，尚未成为正式知识。</p><Link className="mt-2 inline-block font-medium text-primary underline" href={`/app/agent/${submitted.projectId}/knowledge?document=${submitted.documentId}`}>查看申请与审核状态 →</Link></div>}
      </div>
    </section>}
  </div>;
}
