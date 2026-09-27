"use client";

import { useState } from "react";
import { FileText, Search, Copy, Check, Star } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Category = "全部" | "产品定义" | "芯片选型" | "驱动开发" | "调试排障" | "量产";

const categories: Category[] = ["全部", "产品定义", "芯片选型", "驱动开发", "调试排障", "量产"];

interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category: Exclude<Category, "全部">;
  prompt: string;
  uses: number;
  starred: boolean;
}

const templates: PromptTemplate[] = [
  {
    id: "1",
    title: "智能硬件产品需求拆解",
    description: "将一句话产品想法拆解为功能列表、约束条件和技术指标。",
    category: "产品定义",
    prompt: "你是一位资深智能硬件产品经理。请把以下产品想法拆解为：1) 核心功能列表 2) 硬件约束（供电/尺寸/成本）3) 关键技术指标 4) 潜在风险。产品想法：{{input}}",
    uses: 328,
    starred: true,
  },
  {
    id: "2",
    title: "MCU 选型对比分析",
    description: "根据项目需求对比多个候选 MCU 的性能、功耗和成本。",
    category: "芯片选型",
    prompt: "请对比以下 MCU 在我的项目中的适用性：{{mcus}}。项目需求：{{requirements}}。请从算力、功耗、外设、生态、成本五个维度给出评分和推荐。",
    uses: 256,
    starred: false,
  },
  {
    id: "3",
    title: "I2C 驱动移植助手",
    description: "把一个平台的 I2C 设备驱动移植到另一个 MCU 平台。",
    category: "驱动开发",
    prompt: "请将以下针对 {{source_platform}} 的 I2C 驱动代码移植到 {{target_platform}}（HAL 库）。注意处理：1) 寄存器读写差异 2) 延时函数 3) 中断回调。代码：\n{{code}}",
    uses: 189,
    starred: true,
  },
  {
    id: "4",
    title: "量产测试点规划",
    description: "为 PCB 设计生成量产测试点布局建议和测试流程。",
    category: "量产",
    prompt: "基于以下原理图描述，请规划量产测试点：1) 必须预留的测试信号 2) 测试点布局建议 3) ICT/FCT 测试流程。电路描述：{{schematic}}",
    uses: 97,
    starred: false,
  },
  {
    id: "5",
    title: "传感器数据异常排查",
    description: "根据传感器读数异常现象，定位软硬件问题。",
    category: "调试排障",
    prompt: "我的 {{sensor}} 传感器出现以下异常：{{symptom}}。供电：{{power}}，接口：{{interface}}。请按可能性列出排查步骤，包括示波器测量点和软件日志位置。",
    uses: 214,
    starred: false,
  },
  {
    id: "6",
    title: "低功耗设计审查",
    description: "审查原理图和代码中的功耗问题，给出优化建议。",
    category: "调试排障",
    prompt: "请审查以下设计的功耗：目标待机电流 {{target_current}}。请分析：1) 电源树效率 2) 外设关断策略 3) MCU 休眠模式选择 4) 漏电流风险点。设计描述：{{design}}",
    uses: 143,
    starred: true,
  },
  {
    id: "7",
    title: "BOM 成本优化",
    description: "在保证性能前提下，给出 BOM 降本替代方案。",
    category: "量产",
    prompt: "当前 BOM 成本 {{cost}}，目标 {{target}}。请逐项分析可降本器件，给出替代型号、风险等级和验证建议。BOM：{{bom}}",
    uses: 76,
    starred: false,
  },
  {
    id: "8",
    title: "电源树设计",
    description: "根据各模块电压电流需求，设计完整电源树方案。",
    category: "芯片选型",
    prompt: "系统包含以下模块：{{modules}}。输入电源：{{input_power}}。请设计电源树：拓扑选择（LDO/DCDC）、器件选型、时序要求和去耦建议。",
    uses: 168,
    starred: false,
  },
];

export default function PromptsPage() {
  const [category, setCategory] = useState<Category>("全部");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(
    new Set(templates.filter((t) => t.starred).map((t) => t.id))
  );

  const filtered = templates.filter((t) => {
    const matchCategory = category === "全部" || t.category === category;
    const matchSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const copyPrompt = async (t: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(t.prompt);
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard 不可用时静默失败
    }
  };

  const toggleStar = (id: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="prompts"
        icon={FileText}
        title="提示词模板库"
        description="沉淀智能硬件研发全流程的提示词模板，点击即可复制使用"
      />

      {/* 搜索 + 分类筛选 */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索模板..."
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

      {/* 模板卡片 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t, i) => (
          <div
            key={t.id}
            className="animate-fade-up group flex flex-col rounded-xl border border-border/80 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_20px_48px_rgba(15,23,42,0.1)]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t.category}
              </span>
              <button
                onClick={() => toggleStar(t.id)}
                className="text-muted-foreground transition-colors hover:text-amber-500"
                aria-label="收藏"
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    starred.has(t.id) && "fill-amber-500 text-amber-500"
                  )}
                />
              </button>
            </div>
            <h3 className="mt-3 text-base font-semibold text-foreground">{t.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">
              {t.description}
            </p>
            <div className="mt-4 rounded-lg border border-border/60 bg-background/70 p-3">
              <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                {t.prompt}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t.uses} 次使用</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => copyPrompt(t)}
              >
                {copiedId === t.id ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    复制模板
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          没有找到匹配的模板
        </div>
      )}
    </div>
  );
}
