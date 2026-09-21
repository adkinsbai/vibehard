"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Search, Download, Star } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { mcpServers } from "@/lib/mcp/catalog";


const categories = ["全部", "元器件", "EDA", "调试", "资料", "固件"];

export default function McpPage() {
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");

  const filtered = mcpServers.filter((s) => {
    const matchCategory = category === "全部" || s.category === category;
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchCategory && matchSearch;
  });

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="mcp"
        icon={Zap}
        title="MCP Server"
        description="发现、安装和管理硬件研发相关的 MCP Server，扩展 AI 的能力边界"
      />

      {/* 搜索 + 分类 */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 Server、标签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/70 bg-card/80 text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Server 卡片 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s, i) => (
          <Link
            key={s.id}
            href={`/app/mcp/${s.id}`}
            className="animate-fade-up group flex flex-col rounded-xl border border-border/80 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_20px_48px_rgba(15,23,42,0.1)]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Zap className="h-5 w-5" />
              </div>
              {s.verified && (
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                  官方认证
                </span>
              )}
            </div>

            <h3 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">
              {s.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">by {s.author}</p>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              {s.description}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                {s.downloads}
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                {s.stars}
              </span>
              <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                {s.category}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          没有找到匹配的 MCP Server
        </div>
      )}
    </div>
  );
}
