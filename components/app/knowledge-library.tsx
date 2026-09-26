"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { BookOpen, CircuitBoard, Code, Cpu, FileText, FolderOpen, Library, NotebookPen, Search, ShieldCheck } from "lucide-react";
import { BoardLibrary, CatalogDialog } from "@/components/app/board-library";
import { SharedKnowledgeLibrary } from "@/components/app/shared-knowledge-library";
import { ModuleHelp } from "@/components/app/module-help";
import type { CatalogBoard } from "@/lib/board-catalog";
import { knowledgeCategories, knowledgeEntries, type CatalogEntry, type KnowledgeCategory } from "@/lib/knowledge-catalog";
import { cn } from "@/lib/utils";

const icons = { boards: Cpu, manuals: BookOpen, schematics: CircuitBoard, pcb: Library, firmware: Code, experience: NotebookPen };

function ResourceLibrary({ category, entries }: { category: Exclude<KnowledgeCategory, "boards">; entries: CatalogEntry[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const [detail, setDetail] = useState<CatalogEntry | null>(null);
  const guide = knowledgeCategories.find(item => item.id === category)!;
  const needle = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => entry.category === category && `${entry.name} ${entry.board} ${entry.path}`.toLocaleLowerCase().includes(needle));
  return <section aria-label={`${guide.title}目录`} className="space-y-5">
    <header><h2 className="text-xl font-semibold">{guide.title}</h2><p className="mt-2 text-sm text-muted-foreground">{guide.description}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><input aria-label={`搜索${guide.title}`} value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder="搜索资料名称、型号或关联板卡…" className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div><p role="status" className="text-xs text-muted-foreground">{filtered.length} 条目录记录</p></div>
    {!filtered.length ? <div className="rounded-2xl border border-dashed bg-card/30 px-6 py-14 text-center"><FolderOpen className="mx-auto mb-4 size-8 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">{query ? "没有找到匹配的资料" : "暂无目录记录"}</p>{query && <button onClick={() => setQuery("")} className="mt-4 text-sm text-primary underline">清除搜索</button>}</div> : <Dialog.Root>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.slice(0, limit).map(entry => <Dialog.Trigger key={entry.id} onClick={() => setDetail(entry)} className="min-w-0 rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary">
        <FileText className="mb-3 size-5 text-primary" aria-hidden="true" /><h3 className="break-words text-sm font-semibold">{entry.name}</h3><p className="mt-3 break-words text-xs text-muted-foreground">{entry.board}</p><p className="mt-2 text-[11px] text-muted-foreground">{entry.section}</p>
      </Dialog.Trigger>)}</div>
      {detail && <CatalogDialog title={detail.name} description={`${guide.title} · 资料目录`}><dl className="space-y-5 text-sm"><div><dt className="text-xs text-muted-foreground">关联开发板</dt><dd className="mt-2 break-words">{detail.board}</dd></div><div><dt className="text-xs text-muted-foreground">资料分组</dt><dd className="mt-2">{detail.section}</dd></div>{detail.path && <div><dt className="text-xs text-muted-foreground">参考路径</dt><dd className="mt-2 break-all rounded-xl bg-muted/40 p-3 font-mono text-xs leading-6">{detail.path}</dd></div>}</dl></CatalogDialog>}
    </Dialog.Root>}
    {filtered.length > limit && <button className="rounded-lg border px-4 py-2 text-sm hover:bg-muted" onClick={() => setLimit(value => value + 24)}>加载更多（已显示 {Math.min(limit, filtered.length)} / {filtered.length}）</button>}
  </section>;
}

export function KnowledgeLibrary({ boards }: { boards: CatalogBoard[] }) {
  const [category, setCategory] = useState<KnowledgeCategory>("boards");
  const entries = useMemo(() => knowledgeEntries(boards), [boards]);
  return <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Library className="size-6 text-primary" aria-hidden="true" /><h1 className="text-2xl font-bold tracking-tight">知识库</h1><ModuleHelp module="boardLibrary" /></div><p className="mt-2 text-sm text-muted-foreground">从器件选型到工程实践，分类浏览研发资料与开发经验。</p></div><div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />管理员 / 开发者专属</span><Link href="/app/knowledge-review" className="text-xs text-primary hover:underline">知识库审核 →</Link></div></header>
    <nav aria-label="知识类别" className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">{knowledgeCategories.map(item => {
      const Icon = icons[item.id];
      return <button key={item.id} aria-label={item.title} aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={cn("min-w-0 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary", category === item.id ? "border-primary/40 bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground")}><div className="mb-2 flex items-center gap-2"><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="text-sm font-semibold">{item.title}</span></div><p className="text-xs leading-5 opacity-75">{item.description}</p></button>;
    })}</nav>
    <SharedKnowledgeLibrary key={category} category={category} />
    <p className="mb-4 text-xs text-muted-foreground">下方为板卡资料目录线索：仅展示名称与路径，原件未上传或解析时不参与方案检索。</p>
    <div hidden={category !== "boards"}><BoardLibrary boards={boards} /></div>
    {category !== "boards" && <ResourceLibrary key={category} category={category} entries={entries} />}
  </div>;
}
