"use client";

import { use } from "react";
import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Cable } from "lucide-react";
import { findZutilsTool, getZutilsToolCategory } from "@/lib/zutils-tools";

export default function ToolViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const tool = findZutilsTool(slug);
  if (!tool) notFound();

  const category = getZutilsToolCategory(slug);
  const Icon = tool.icon;

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/40 px-4 py-3 backdrop-blur-xl lg:px-6">
        <Link
          href="/app/tools"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="返回工具箱"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {tool.name}
            </h1>
            <ModuleHelp module="tools" />
            {category && (
              <span className="hidden shrink-0 rounded-md border border-border/70 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                {category.name}
              </span>
            )}
            {tool.needsDevice && (
              <span className="hidden shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-500 sm:inline-flex">
                <Cable className="h-3 w-3" />
                需连接设备
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {tool.desc}
          </p>
        </div>
        <a
          href={tool.src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          新窗口打开
        </a>
      </div>

      {/* 嵌入工具页面 */}
      <iframe
        src={tool.src}
        title={tool.name}
        className="w-full flex-1 bg-white dark:bg-[#0b0f14]"
      />
    </div>
  );
}
