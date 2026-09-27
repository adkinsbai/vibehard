"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiPath } from "@/lib/utils";
import { knowledgeDraftSchema, needsKnowledgeReview, type KnowledgeAction, type KnowledgeDocument, type KnowledgeDraft } from "@/lib/agent/knowledge";

const emptyDraft: KnowledgeDraft = { title: "", source: "", content: "", kind: "manual" };
const kinds = { manual: "工程资料", schematic: "原理图分析", product: "产品需求", sdk: "SDK / 芯片资料" };

export function ProjectKnowledge({ projectId, initialDocumentId }: { projectId: string; initialDocumentId?: string }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<KnowledgeDraft>(emptyDraft);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [permissions, setPermissions] = useState({ canEdit: false, canReview: false });
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "published">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = documents.find(doc => doc.id === selectedId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected?.draft ?? emptyDraft);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(apiPath(`/api/projects/${projectId}/knowledge`), { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "读取知识库失败");
        if (!controller.signal.aborted) {
          setDocuments(body.documents);
          setPermissions(body.permissions ?? { canEdit: false, canReview: false });
          setName(body.projectName ?? "");
          const initial = (body.documents as KnowledgeDocument[]).find(doc => doc.id === initialDocumentId);
          if (initial) { setSelectedId(initial.id); setDraft(initial.draft); }
        }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [projectId, initialDocumentId]);

  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  function select(doc?: KnowledgeDocument) {
    if (dirty && !window.confirm("当前草稿尚未保存，是否放弃本次编辑？")) return;
    setSelectedId(doc?.id ?? ""); setDraft(doc?.draft ?? { ...emptyDraft }); setConfirmed(false); setConfirmDisable(false); setNotice(""); setError("");
    setReason("");
  }
  function edit<K extends keyof KnowledgeDraft>(key: K, value: KnowledgeDraft[K]) {
    setDraft(current => ({ ...current, [key]: value })); setConfirmed(false); setConfirmDisable(false); setNotice("");
  }
  async function mutate(action: KnowledgeAction) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(apiPath(`/api/projects/${projectId}/knowledge`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 403) setPermissions({ canEdit: false, canReview: false });
        throw new Error(body.error || "操作失败");
      }
      const next = body.documents as KnowledgeDocument[];
      setDocuments(next);
      const doc = action.action === "create" ? next.at(-1) : next.find(item => item.id === action.documentId);
      if (doc) { setSelectedId(doc.id); setDraft(doc.draft); }
      setConfirmed(false);
      setConfirmDisable(false);
      setReason("");
      setNotice(action.action === "reject" ? "已退回并记录原因；提交者修改后可重新申请。" : action.action === "publish" ? "已审核发布，下一个 Agent 任务会使用此版本。" : action.action === "disable" ? "已停用；正在运行的任务仍使用启动时快照。" : "草稿已保存，尚未进入 Agent 正式上下文。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }
  function save() {
    const parsed = knowledgeDraftSchema.safeParse(draft);
    if (!parsed.success) { setError("请填写标题、来源和正文；正文最多 6000 字。"); return; }
    void mutate(selected ? { action: "edit", documentId: selected.id, expectedRevision: selected.revision, draft: parsed.data } : { action: "create", draft: parsed.data });
  }
  async function importText(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 32_768) { setError("仅支持不超过 32 KB 的 .md / .txt 文本；原理图 PDF 需先分析成草稿。"); return; }
    setBusy(true);
    try {
      const content = await file.text();
      if (content.length > 6000) throw new Error("正文超过 6000 字，请精简后导入");
      setDraft(current => ({ ...current, title: current.title || file.name, source: current.source || file.name, content }));
      setConfirmed(false); setNotice("已读入编辑框，仍需保存草稿并审核。"); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败"); }
    finally { setBusy(false); }
  }
  const visible = documents.filter(doc => filter === "all" || (filter === "published" ? doc.publishedVersion !== null : needsKnowledgeReview(doc)));
  const active = documents.filter(doc => doc.publishedVersion !== null);
  const activeCharacters = active.reduce((sum, doc) => sum + (doc.versions.find(version => version.version === doc.publishedVersion)?.content.length ?? 0), 0);

  return <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
    <header className="space-y-2">
      <Link href="/app/agent" onClick={event => { if (dirty && !window.confirm("放弃未保存的编辑并返回？")) event.preventDefault(); }} className="text-sm text-primary">← 返回 Agent 项目</Link>
      <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">项目知识库{name ? ` · ${name}` : ""}</h1><ModuleHelp module="knowledge" /></div>
      <p className="text-sm text-muted-foreground">用户只能提交入库申请，由平台管理员或开发者核对来源、引脚和待确认项后审核发布。只有正式版本进入本项目 Agent；不向其他项目共享。</p>
      {permissions.canReview && <Link href="/app/knowledge-review" className="inline-block text-sm text-primary">进入平台知识库审核</Link>}
      <p className="text-xs text-muted-foreground">{documents.length}/20 份资料 · 正式版本正文 {activeCharacters}/24000 字 · 每份最多 6000 字、20 个历史版本。首版为文本快照，不是向量检索库。</p>
    </header>
    {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}（发生版本冲突时请先复制未保存正文，再刷新页面。）</div>}
    {notice && <p role="status" className="rounded border p-3 text-sm text-primary">{notice}</p>}
    {loading ? <p>加载中…</p> : <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3 rounded-lg border bg-card p-4">
        {permissions.canEdit && <Button onClick={() => select()} disabled={busy} className="w-full">新建资料草稿</Button>}
        <div className="flex gap-1" aria-label="资料筛选">{(["all", "pending", "published"] as const).map(value => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>{({ all: "全部", pending: "待审核", published: "已发布" })[value]}</Button>)}</div>
        {!visible.length && <p className="text-sm text-muted-foreground">此分类暂无资料</p>}
        {visible.map(doc => <button key={doc.id} disabled={busy} onClick={() => select(doc)} className={`w-full rounded border p-3 text-left text-sm ${selectedId === doc.id ? "border-primary bg-primary/5" : "border-border"}`}>
          <span className="block break-words font-medium">{doc.draft.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{doc.publishedVersion ? `正式 v${doc.publishedVersion}` : doc.versions.length ? "已停用" : "草稿"}{needsKnowledgeReview(doc) ? " · 待审核" : doc.rejection?.revision === doc.revision ? " · 已退回" : ""}</span>
        </button>)}
      </aside>
      <section className="min-w-0 space-y-4 rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{selected ? "资料与审核状态" : permissions.canEdit ? "新建草稿" : "请选择待审核资料"}</h2>
        <fieldset disabled={busy || !permissions.canEdit} className="space-y-4">
          <label className="block space-y-1 text-sm"><span>资料标题</span><Input value={draft.title} maxLength={120} onChange={event => edit("title", event.target.value)} /></label>
          <label className="block space-y-1 text-sm"><span>资料类型</span><select className="block w-full rounded border bg-background p-2" value={draft.kind} onChange={event => edit("kind", event.target.value as KnowledgeDraft["kind"])}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block space-y-1 text-sm"><span>来源 / 证据位置（文件名、页码或 URL）</span><Input value={draft.source} maxLength={1000} onChange={event => edit("source", event.target.value)} /></label>
          {permissions.canEdit && <label className="block space-y-1 text-sm"><span>导入文本（仅填入草稿）</span><input aria-label="导入文本" type="file" accept=".md,.txt" className="block text-xs" onChange={event => { void importText(event.target.files?.[0]); event.target.value = ""; }} /></label>}
          <label className="block space-y-1 text-sm"><span>正文 · {draft.content.length}/6000 字</span><Textarea value={draft.content} maxLength={6000} rows={14} onChange={event => edit("content", event.target.value)} className="font-mono text-sm" /></label>
          {permissions.canEdit && <Button onClick={save} disabled={!dirty}>保存草稿</Button>}
        </fieldset>
        {selected && <div className="space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">保存草稿即提交待审核版本，不会覆盖当前正式版本。只有管理员或开发者可以审核发布、退回或停用。</p>
          {selected.rejection && <p className="rounded border p-3 text-sm">退回原因：{selected.rejection.reason}<br />审核人：{selected.rejection.reviewedBy} · {selected.rejection.reviewedAt}</p>}
          {permissions.canReview && <>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || dirty} onChange={event => setConfirmed(event.target.checked)} />我作为管理员或开发者已核对来源及正文，保留不确定项标记，确认可作为本项目开发参考。</label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || dirty || !confirmed || !needsKnowledgeReview(selected)} onClick={() => void mutate({ action: "publish", documentId: selected.id, expectedRevision: selected.revision, confirmed: true })}>审核并发布</Button>
            <Button variant="outline" disabled={busy || dirty || !selected.publishedVersion} onClick={() => setConfirmDisable(true)}>停用正式版本</Button>
          </div>
          {needsKnowledgeReview(selected) && <div className="space-y-2">
            <label className="block text-sm">退回原因<Textarea value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="请说明需补充或纠正的证据" /></label>
            <Button variant="outline" disabled={busy || dirty || !reason.trim()} onClick={() => void mutate({ action: "reject", documentId: selected.id, expectedRevision: selected.revision, reason: reason.trim() })}>退回修改</Button>
          </div>}
          {confirmDisable && <div role="group" aria-label="停用确认" className="space-y-2 rounded border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm">停用后，新任务不再加载此资料；已有任务不受影响。确认停用？</p>
            <div className="flex gap-2"><Button variant="destructive" size="sm" disabled={busy || dirty} onClick={() => void mutate({ action: "disable", documentId: selected.id, expectedRevision: selected.revision })}>确认停用</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDisable(false)}>取消停用</Button></div>
          </div>}
          </>}
          <h3 className="pt-2 text-sm font-semibold">正式版本与审核记录</h3>
          {!selected.versions.length && <p className="text-xs text-muted-foreground">尚未发布过</p>}
          {[...selected.versions].reverse().map(version => <details key={version.version} className="rounded border p-3 text-sm">
            <summary className="cursor-pointer">v{version.version} · {version.title} · {selected.publishedVersion === version.version ? "当前正式" : "历史"}</summary>
            <p className="mt-3 break-all text-xs text-muted-foreground">审核人 {version.reviewedBy} · {version.reviewedAt}<br />来源：{version.source}<br />SHA256：{version.sha256}</p>
            <pre className="my-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{version.content}</pre>
            {permissions.canEdit && <Button size="sm" variant="outline" disabled={busy || dirty} onClick={() => void mutate({ action: "restore-draft", documentId: selected.id, expectedRevision: selected.revision, version: version.version })}>复制此版本为草稿（需重新审核）</Button>}
          </details>)}
        </div>}
      </section>
    </div>}
  </div>;
}
