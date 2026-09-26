"use client";

import { useEffect, useState } from "react";
import { needsKnowledgeReview, type KnowledgeDocument, type KnowledgeDraft } from "@/lib/agent/knowledge";
import type { SharedCategory } from "@/lib/agent/shared-knowledge";
import { knowledgeCategories } from "@/lib/knowledge-catalog";
import { apiPath } from "@/lib/utils";

type Entry = { id: string; category: SharedCategory; document: KnowledgeDocument; createdBy: string | null };
const blank: KnowledgeDraft = { title: "", source: "", content: "", kind: "manual" };
const categoryLabel = (value: SharedCategory) => knowledgeCategories.find(item => item.id === value)?.title ?? value;
async function fetchEntries(category: SharedCategory): Promise<{ entries: Entry[]; viewerId: string }> {
  const response = await fetch(apiPath(`/api/knowledge/shared?category=${category}`), { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "读取资料失败");
  return data;
}

export function SharedKnowledgeLibrary({ category }: { category: SharedCategory }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [draft, setDraft] = useState<KnowledgeDraft>(blank);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchEntries(category).then(data => { if (active) { setEntries(data.entries); setViewerId(data.viewerId); setLoaded(true); } })
      .catch(reason => { if (active) { setError(reason.message); setLoaded(true); } });
    return () => { active = false; };
  }, [category]);
  async function mutate(mutation: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(apiPath("/api/knowledge/shared"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, mutation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      const refreshed = await fetchEntries(category); setEntries(refreshed.entries); setViewerId(refreshed.viewerId); setNotice(success); setEditing(null); setDraft(blank);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  }
  async function importMarkdown(file?: File) {
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 20_000) { setError("只能导入不超过 20 KB 的 .md 或 .txt 文件"); return; }
    const content = await file.text();
    if (content.length > 6000) { setError("正文最多 6000 字，请整理后再提交"); return; }
    setDraft(current => ({ ...current, title: current.title || file.name.replace(/\.(md|txt)$/i, ""), source: current.source || file.name, content }));
    setError("");
  }
  const visible = entries.filter(entry => entry.category === category);
  const published = visible.filter(entry => entry.document.publishedVersion !== null);
  const pending = visible.filter(entry => needsKnowledgeReview(entry.document));
  return <section aria-label={`${categoryLabel(category)}已发布资料`} className="mb-8 space-y-5 rounded-2xl border bg-card p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{categoryLabel(category)} · 已发布资料</h2><p className="mt-1 text-sm text-muted-foreground">只有已发布的正文会参与方案检索；本项目已发布资料仅供本项目使用。</p></div><span className="text-xs text-muted-foreground">{published.length} 份已发布 · {pending.length} 份待审核</span></div>
    {!loaded ? <p className="text-sm text-muted-foreground">正在读取资料…</p> : published.length === 0 ? <p className="text-sm text-muted-foreground">这一分类暂无已发布正文。</p> : <div className="grid gap-3 md:grid-cols-2">{published.map(entry => {
      const version = entry.document.versions.find(item => item.version === entry.document.publishedVersion)!;
      return <details key={entry.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{version.title} · v{version.version}</summary><p className="mt-2 break-all text-xs text-muted-foreground">来源：{version.source} · SHA256 {version.sha256.slice(0, 12)}…</p><p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{version.content}</p><div className="mt-3 flex gap-3 text-xs">{entry.createdBy === viewerId && <button disabled={busy} className="text-primary underline" onClick={() => { setEditing(entry); setDraft(entry.document.draft); }}>编辑新草稿</button>}<button disabled={busy} className="text-destructive underline" onClick={() => { if (window.confirm(`停用「${version.title}」的已发布版本？`)) void mutate({ action: "disable", documentId: entry.id, expectedRevision: entry.document.revision }, "资料已停用"); }}>停用</button></div></details>;
    })}</div>}
    {pending.length > 0 && <div><h3 className="font-medium">待审核草稿</h3><div className="mt-2 space-y-2">{pending.map(entry => <details key={entry.id} className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{entry.document.draft.title} · {entry.document.draft.source}</summary><p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">{entry.document.draft.content}</p><div className="mt-3 flex flex-wrap gap-3">{entry.createdBy === viewerId && <button disabled={busy} className="text-primary underline" onClick={() => { setEditing(entry); setDraft(entry.document.draft); }}>编辑草稿</button>}<button disabled={busy} className="text-primary underline" onClick={() => { if (window.confirm(`确认已核对「${entry.document.draft.title}」的内容与来源，并发布到平台知识库？`)) void mutate({ action: "publish", documentId: entry.id, expectedRevision: entry.document.revision, confirmed: true }, "已审核并发布"); }}>审核发布</button><button disabled={busy} className="text-destructive underline" onClick={() => { const reason = window.prompt("请填写退回原因"); if (reason?.trim()) void mutate({ action: "reject", documentId: entry.id, expectedRevision: entry.document.revision, reason: reason.trim() }, "已退回草稿"); }}>退回</button></div></details>)}</div></div>}
    <form onSubmit={event => { event.preventDefault(); void mutate(editing ? { action: "edit", documentId: editing.id, expectedRevision: editing.document.revision, draft } : { action: "create", draft }, editing ? "草稿已更新，等待审核" : "资料已提交审核"); }} className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between"><h3 className="font-medium">{editing ? `编辑草稿：${editing.document.draft.title}` : "添加 Markdown / 文本资料"}</h3>{editing && <button type="button" className="text-xs text-primary underline" onClick={() => { setEditing(null); setDraft(blank); }}>取消编辑</button>}</div>
      <p className="text-xs text-muted-foreground">仅收录已核对的文本内容。PDF、ZIP 和目录路径尚未解析，不会自动进入检索。</p>
      <div className="grid gap-3 md:grid-cols-2"><input aria-label="资料标题" required maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="资料标题" className="rounded-lg border bg-background p-2 text-sm" /><input aria-label="资料来源" required maxLength={1000} value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })} placeholder="来源链接、文件名或工程记录" className="rounded-lg border bg-background p-2 text-sm" /></div>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm">资料类型 <select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as KnowledgeDraft["kind"] })} className="ml-2 rounded-lg border bg-background p-2"><option value="manual">手册</option><option value="schematic">原理图分析</option><option value="product">产品资料</option><option value="sdk">SDK / 开发经验</option></select></label><label className="text-sm">导入 .md / .txt <input type="file" accept=".md,.txt,text/markdown,text/plain" onChange={event => void importMarkdown(event.target.files?.[0])} className="block text-xs" /></label></div>
      <textarea aria-label="资料正文" required maxLength={6000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder="已核对的资料正文，最多 6000 字" className="min-h-36 w-full rounded-lg border bg-background p-3 text-sm" />
      <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "保存中…" : editing ? "保存新草稿" : "提交审核"}</button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}
    </form>
  </section>;
}
