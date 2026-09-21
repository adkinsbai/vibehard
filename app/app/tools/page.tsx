"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Wrench, Cable, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { zutilsCategories, allZutilsTools } from "@/lib/zutils-tools";

export default function ToolsPage() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const searching = search.trim().length > 0;

  const visibleCategories = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return zutilsCategories
      .filter((c) => category === "all" || c.id === category)
      .map((c) => ({
        ...c,
        tools: keyword
          ? c.tools.filter(
              (t) =>
                t.name.toLowerCase().includes(keyword) ||
                t.desc.toLowerCase().includes(keyword) ||
                t.slug.toLowerCase().includes(keyword)
            )
          : c.tools,
      }))
      .filter((c) => c.tools.length > 0);
  }, [category, search]);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="tools"
        icon={Wrench}
        title="实用工具箱"
        description={`${allZutilsTools.length} 个嵌入式研发常用工具与仿真实验台，即开即用，数据不出浏览器`}
      />

      {/* 搜索 + 分类 */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索工具，如 CRC、串口、电阻..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              category === "all"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card/80 text-muted-foreground hover:text-foreground"
            )}
          >
            全部
          </button>
          {zutilsCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                category === c.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/70 bg-card/80 text-muted-foreground hover:text-foreground"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {visibleCategories.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            没有找到匹配「{search}」的工具，换个关键词试试
          </p>
        </div>
      )}

      {/* 分类区块 */}
      <div className="space-y-10">
        {visibleCategories.map((c) => (
          <section key={c.id} id={c.id}>
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="border-l-4 border-primary pl-3 text-lg font-semibold tracking-tight text-foreground">
                {c.name}
              </h2>
              <span className="text-xs text-muted-foreground">
                {c.desc} · {c.tools.length} 个
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {c.tools.map((t, i) => {
                const Icon = t.icon;
                return (
                  <Link
                    key={t.slug}
                    href={`/app/tools/${t.slug}`}
                    className="animate-fade-up group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_20px_48px_rgba(15,23,42,0.1)]"
                    style={{ animationDelay: searching ? `${i * 30}ms` : undefined }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                        <Icon className="h-5 w-5" />
                      </div>
                      {t.needsDevice && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                          <Cable className="h-3 w-3" />
                          需连接设备
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                      {t.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {t.desc}
                    </p>
                    <span className="mt-3 inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      打开工具
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
