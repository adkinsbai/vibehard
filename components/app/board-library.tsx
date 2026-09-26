"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, FileText, Search, SlidersHorizontal, X } from "lucide-react";
import { catalogFacets, filterBoards, type CatalogBoard } from "@/lib/board-catalog";
import { cn } from "@/lib/utils";

const categoryColors: Record<string, string> = {
  "4G通信": "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "AMOLED触摸屏": "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "LCD触摸屏": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "LCD屏": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "电子纸屏": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};
const pill = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-5";
const button = "rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

function CategoryBadge({ category }: { category: string }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold", categoryColors[category] ?? "bg-primary/10 text-primary")}>{category}</span>;
}

export function CatalogDialog({ title, description, children, wide = false }: { title: string; description: string; children: React.ReactNode; wide?: boolean }) {
  return <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
    <Dialog.Popup className={cn("fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl", wide ? "max-w-5xl" : "max-w-2xl")}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-5">
        <div className="min-w-0"><Dialog.Title className="break-words text-lg font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">{description}</Dialog.Description></div>
        <Dialog.Close aria-label="关闭弹窗" className="rounded-lg p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><X className="size-4" /></Dialog.Close>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
    </Dialog.Popup>
  </Dialog.Portal>;
}

function BoardDetails({ board }: { board: CatalogBoard }) {
  const sections = [...new Set(board.resources.map(resource => resource.section))];
  return <>
    <div className="mb-5 flex flex-wrap items-center gap-2"><CategoryBadge category={board.category} /><span className="text-xs text-muted-foreground">原始尺寸：{board.size || "未提供"} · 待核验</span></div>
    <h3 className="mb-3 text-sm font-semibold">板载外设 / 特性</h3>
    <div className="mb-6 flex flex-wrap gap-2">{board.features.length ? board.features.map(feature => <span key={feature} className={cn(pill, "border-primary/20 bg-primary/5 text-primary")}>{feature}</span>) : <p className="text-sm text-muted-foreground">暂无特性记录</p>}</div>
    <h3 className="border-t pt-5 text-sm font-semibold">资料清单（{board.resources.length} 条）</h3>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">按资料类型查看名称与参考路径。</p>
    {!sections.length && <div className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">这款板卡还没有资料目录。</div>}
    {sections.map(section => <section key={section} className="mt-5">
      <h4 className="mb-3 text-xs font-semibold text-muted-foreground">{section}</h4>
      <ul className="space-y-3">{board.resources.filter(resource => resource.section === section).map((resource, index) => <li key={`${resource.name}-${index}`} className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-start gap-2"><FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-words text-sm font-medium">{resource.name}</span></div>
        {resource.path && <p className="mt-2 break-all pl-6 font-mono text-[11px] leading-5 text-muted-foreground">参考路径：{resource.path}</p>}
      </li>)}</ul>
    </section>)}
  </>;
}

function FacetChart({ title, entries, total }: { title: string; entries: [string, number][]; total: number }) {
  return <section className="rounded-2xl border bg-card p-5"><h2 className="mb-5 text-base font-semibold">{title}</h2><div className="space-y-4">{entries.map(([name, count]) => <div key={name}>
    <div className="mb-1.5 flex justify-between text-xs"><span>{name}</span><span className="text-muted-foreground">{count} 款</span></div>
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/75" style={{ width: `${total ? count / total * 100 : 0}%` }} /></div>
  </div>)}</div></section>;
}

export function BoardLibrary({ boards }: { boards: CatalogBoard[] }) {
  const [tab, setTab] = useState<"products" | "stats">("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [detail, setDetail] = useState<CatalogBoard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const facets = useMemo(() => catalogFacets(boards), [boards]);
  const filtered = useMemo(() => filterBoards(boards, query, category, features), [boards, query, category, features]);
  const resources = boards.flatMap(board => board.resources);
  const selectedBoards = boards.filter(board => selected.includes(board.name));
  const reset = () => { setQuery(""); setCategory(""); setFeatures([]); };

  return <div>
    <header className="mb-6 border-b pb-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-bold tracking-tight">ESP32-S3 开发板选型库</h2>
          <p className="mt-1 text-sm text-muted-foreground">按功能与外设筛选板卡，比较型号并查看关联资料。</p>
        </div>
      </div>
      <div className="my-6 flex flex-wrap gap-x-7 gap-y-3">{[[boards.length, "款板卡"], [facets.categories.length, "个分类"], [resources.length, "条资料目录"], [facets.features.length, "个特性标签"]].map(([count, label]) => <div key={label} className="flex items-baseline gap-1.5"><span className="text-2xl font-bold tabular-nums text-primary">{count}</span><span className="text-xs text-muted-foreground">{label}</span></div>)}</div>
      <div className="flex gap-6" aria-label="知识库视图">{([['products', '产品库'], ['stats', '数据看板']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("border-b-2 px-2 pb-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary", tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>)}</div>
    </header>


    {tab === "stats" ? <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">{[[boards.length, "开发板型号"], [resources.length, "资料目录条目"], [facets.features.length, "外设与特性标签"]].map(([count, label]) => <div className="rounded-2xl border bg-card p-5" key={label}><p className="text-3xl font-bold text-primary">{count}</p><p className="mt-2 text-sm text-muted-foreground">{label}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">统计全部 {boards.length} 款板卡，不受产品库筛选影响；资料按目录条目计数，同一文件可能被多款板卡引用。</p>
      <div className="grid gap-5 lg:grid-cols-2"><FacetChart title="板卡分类分布" entries={facets.categories} total={boards.length} /><FacetChart title="外设与特性分布" entries={facets.features} total={boards.length} /></div>
    </div> : <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72"><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="搜索板卡" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索型号或功能关键词…" className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>
        <div className="flex flex-1 flex-wrap gap-1.5" aria-label="特性筛选">{facets.features.map(([feature]) => <button key={feature} aria-pressed={features.includes(feature)} onClick={() => setFeatures(current => current.includes(feature) ? current.filter(value => value !== feature) : [...current, feature])} className={cn(pill, "transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary", features.includes(feature) ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground")}>{feature}</button>)}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row">
        <aside className="shrink-0 lg:w-40"><h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><SlidersHorizontal className="size-3.5" />产品分类</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{[["", boards.length], ...facets.categories].map(([name, count]) => <button key={name} aria-pressed={category === name} onClick={() => setCategory(String(name))} className={cn("flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary", category === name ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><span>{name || "全部"}</span><span className="tabular-nums opacity-75">{count}</span></button>)}</div>
        </aside>
        <section className="min-w-0 flex-1" aria-label="板卡列表">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p role="status">{filtered.length} 款板卡{features.length > 0 ? " · 同时满足所选特性" : ""}</p>{(query || category || features.length > 0) && <button onClick={reset} className="text-primary hover:underline">清除筛选</button>}</div>
          {!filtered.length && <div className="rounded-2xl border border-dashed p-10 text-center"><Search className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">没有符合条件的板卡</p><button className={cn(button, "mt-4")} onClick={reset}>重置筛选</button></div>}
          <Dialog.Root>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map(board => <article key={board.name} className="group flex min-w-0 flex-col rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
              <Dialog.Trigger onClick={() => setDetail(board)} aria-label={`查看 ${board.name}`} className="min-w-0 flex-1 rounded-t-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="mb-3 flex items-start justify-between gap-2"><h3 className="min-w-0 truncate text-sm font-semibold group-hover:text-primary" title={board.name}>{board.name}</h3><CategoryBadge category={board.category} /></div>
                <p className="mb-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{board.features.join(" · ") || "板载暂无特性记录"}</p>
                <div className="flex min-h-14 content-start flex-wrap gap-1.5">{board.features.slice(0, 4).map(feature => <span key={feature} className={cn(pill, "text-muted-foreground")}>{feature}</span>)}{board.features.length > 4 && <span className={cn(pill, "text-muted-foreground")}>+{board.features.length - 4}</span>}</div>
              </Dialog.Trigger>
              <footer className="mx-4 flex items-center justify-between gap-2 border-t py-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><FileText className="size-3" />{board.resources.length} 条目录</span><label className={cn("flex items-center gap-1.5", selected.length >= 4 && !selected.includes(board.name) && "opacity-40")}><input aria-label={`对比 ${board.name}`} type="checkbox" className="accent-primary" checked={selected.includes(board.name)} disabled={selected.length >= 4 && !selected.includes(board.name)} onChange={event => setSelected(current => event.target.checked ? [...current, board.name].slice(0, 4) : current.filter(name => name !== board.name))} />对比</label></footer>
            </article>)}</div>
            {detail && <CatalogDialog title={detail.name} description="板卡资料目录 · 硬件资料、技术手册与示例程序"><BoardDetails board={detail} /></CatalogDialog>}
          </Dialog.Root>
        </section>
      </div>
    </>}

    {selected.length > 0 && <div className="sticky bottom-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/95 p-4 shadow-lg backdrop-blur-xl">
      <div className="min-w-0"><p className="text-sm font-semibold">已选 {selected.length} / 4 款板卡</p><p className="mt-1 text-xs text-muted-foreground">至少选 2 款开始对比，切换筛选会保留选择。</p><div className="mt-2 flex flex-wrap gap-2">{selected.map(name => <button key={name} aria-label={`移除 ${name}`} onClick={() => setSelected(current => current.filter(value => value !== name))} className={cn(pill, "max-w-60 gap-1 bg-muted/50")}><span className="truncate">{name}</span><X className="size-3 shrink-0" /></button>)}</div></div>
      <div className="flex gap-2"><button className={button} onClick={() => setSelected([])}>清空</button><Dialog.Root><Dialog.Trigger disabled={selected.length < 2} className={cn(button, "inline-flex items-center gap-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>开始对比<ArrowRight className="size-3.5" /></Dialog.Trigger><CatalogDialog title="板卡参数对比" description="对比的是目录元数据，非已核验规格；未标注特性不代表硬件不支持。" wide>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left text-xs"><thead><tr><th className="border-b p-3">项目</th>{selectedBoards.map(board => <th key={board.name} className="max-w-60 break-words border-b p-3 text-sm">{board.name}</th>)}</tr></thead><tbody>
          <tr><th scope="row" className="border-b p-3 font-medium">分类</th>{selectedBoards.map(board => <td key={board.name} className="border-b p-3">{board.category}</td>)}</tr>
          <tr><th scope="row" className="border-b p-3 font-medium">原始尺寸（待核验）</th>{selectedBoards.map(board => <td key={board.name} className="border-b p-3">{board.size || "未提供"}</td>)}</tr>
          <tr><th scope="row" className="border-b p-3 font-medium">资料目录</th>{selectedBoards.map(board => <td key={board.name} className="border-b p-3">{board.resources.length} 条</td>)}</tr>
          {[...new Set(selectedBoards.flatMap(board => board.features))].map(feature => <tr key={feature}><th scope="row" className="border-b p-3 font-medium">{feature}</th>{selectedBoards.map(board => <td key={board.name} className={cn("border-b p-3", board.features.includes(feature) ? "text-primary" : "text-muted-foreground")}>{board.features.includes(feature) ? "已标注" : "未标注"}</td>)}</tr>)}
        </tbody></table></div>
      </CatalogDialog></Dialog.Root></div>
    </div>}
  </div>;
}
