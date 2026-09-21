"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import { notFound } from "next/navigation";
import {
  Zap,
  ArrowLeft,
  Download,
  Star,
  Copy,
  Check,
  Terminal,
  Wrench,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { mcpServers } from "@/lib/mcp/catalog";
import { cn } from "@/lib/utils";

const toolExamples: Record<string, { name: string; desc: string }[]> = {
  "lcsc-components": [
    { name: "search_components", desc: "按关键词/分类/参数搜索元器件" },
    { name: "get_component_detail", desc: "获取元器件价格、库存、封装详情" },
    { name: "get_alternatives", desc: "查找缺料器件的兼容替代型号" },
    { name: "export_bom", desc: "导出 BOM 采购清单（CSV）" },
  ],
  "eda-schematic": [
    { name: "create_schematic", desc: "创建新原理图工程" },
    { name: "place_component", desc: "放置元器件并连线" },
    { name: "auto_route", desc: "自动布线" },
    { name: "export_netlist", desc: "导出网表和 BOM" },
  ],
  "openocd-debug": [
    { name: "connect_target", desc: "通过 SWD/JTAG 连接目标芯片" },
    { name: "flash_write", desc: "烧录固件到 Flash" },
    { name: "read_registers", desc: "读取 MCU 寄存器值" },
    { name: "set_breakpoint", desc: "设置断点并单步调试" },
  ],
};

function getTools(id: string) {
  return (
    toolExamples[id] ?? [
      { name: "run", desc: "执行 Server 主功能" },
      { name: "status", desc: "查询运行状态" },
      { name: "configure", desc: "修改配置参数" },
    ]
  );
}

export default function McpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const server = mcpServers.find((s) => s.id === id);
  const [copied, setCopied] = useState(false);

  if (!server) {
    notFound();
  }

  const config = JSON.stringify(
    {
      mcpServers: {
        [server.id]: {
          command: "npx",
          args: ["-y", `@vibehard/mcp-${server.id}`],
          env: { API_KEY: "<your-api-key>" },
        },
      },
    },
    null,
    2
  );

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 不可用时静默失败
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <Link
        href="/app/mcp"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回 Server 列表
      </Link>

      {/* 头部信息 */}
      <div className="rounded-xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Zap className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{server.name}</h1>
                <ModuleHelp module="mcp" />
                {server.verified && (
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                    官方认证
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">by {server.author}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {server.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              {server.downloads} 安装
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              {server.stars}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* 左列：安装配置 */}
        <div className="space-y-6 lg:col-span-3">
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Terminal className="h-4 w-4 text-primary" />
              安装配置
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              将以下配置添加到你的 MCP 客户端配置文件（如 Claude Code / Cursor）：
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/80 p-4 font-mono text-xs leading-6 text-foreground">
                {config}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className={cn("absolute right-3 top-3 gap-1.5")}
                onClick={copyConfig}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </>
                )}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              保存配置后重启客户端，即可在对话中调用该 Server 的工具。
            </p>
          </div>

          {/* 工具列表 */}
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              提供的工具
            </h2>
            <div className="space-y-2">
              {getTools(server.id).map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2.5"
                >
                  <code className="font-mono text-sm font-medium text-primary">
                    {tool.name}
                  </code>
                  <span className="ml-4 text-sm text-muted-foreground">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右列：信息 */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookOpen className="h-4 w-4 text-primary" />
              使用示例
            </h2>
            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
              <p className="text-sm leading-6 text-muted-foreground">
                {server.id === "lcsc-components" &&
                  "「帮我查一下 STM32F103C8T6 的当前价格和库存，如果缺料推荐替代型号」"}
                {server.id === "eda-schematic" &&
                  "「基于这个方案生成原理图：ESP32-S3 + SHT30 + OLED，自动完成连线」"}
                {server.id === "openocd-debug" &&
                  "「连接我的 ST-Link，把 build/firmware.bin 烧录到 STM32，然后读取 RCC 寄存器」"}
                {!["lcsc-components", "eda-schematic", "openocd-debug"].includes(
                  server.id
                ) &&
                  `「使用 ${server.name} 处理我当前的任务」`}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">标签</h2>
            <div className="flex flex-wrap gap-1.5">
              {server.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border/70 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">分类</h2>
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {server.category}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
