import Link from "next/link";
import { ModuleHelp } from "@/components/app/module-help";
import {
  ArrowRight,
  FileText,
  Cpu,
  Layers,
  BookOpen,
  CircuitBoard,
  Package,
  MonitorSmartphone,
  Wrench,
  Zap,
  Bot,
} from "lucide-react";
import { Reveal } from "@/components/reveal";

const tools = [
  {
    id: "agent",
    title: "Agent 项目工作台",
    description: "连接独立 Codex Runner，在隔离工作区中完成真实工程任务，流式查看工具调用、审批与产物。",
    icon: Bot,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "hover:border-sky-500/35",
    stats: "Codex Runtime",
  },
  {
    id: "design",
    title: "硬件方案生成",
    description: "用自然语言描述需求，生成架构建议、BOM 思路、接口规划、风险检查，并可直接生成原理图。",
    icon: Layers,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "hover:border-blue-500/35",
    stats: "方案 + 原理图",
  },
  {
    id: "datasheets",
    title: "芯片资料解析",
    description: "输入芯片 / 传感器型号，AI 全网检索 datasheet、引脚图与参考原理图，生成可调用的器件档案。",
    icon: BookOpen,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "hover:border-amber-500/35",
    stats: "全网检索",
  },
  {
    id: "schematic",
    title: "原理图识别",
    description: "上传原理图图片或 PDF，自动识别元器件型号、电路拓扑和关键参数，输出结构化分析结果。",
    icon: Cpu,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "hover:border-emerald-500/35",
    stats: "PDF / 图片",
  },
  {
    id: "pcb",
    title: "PCB 生成",
    description: "复用库中已验证最小电路，自动完成 PCB 布局布线与 DRC 检查，生成 3D 外壳开孔模型。",
    icon: CircuitBoard,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "hover:border-violet-500/35",
    stats: "Gerber + 3D",
  },
  {
    id: "bom",
    title: "物料与 BOM",
    description: "从物料库自动选型组合生成 BOM，一键导出，或对接立创商城 API 一键下单、一键 SMT。",
    icon: Package,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "hover:border-orange-500/35",
    stats: "一键下单",
  },
  {
    id: "embedded",
    title: "嵌入式开发",
    description: "连接开发板，用自然语言生成运行在板子上的嵌入式 APP，模拟器验证后一键烧录。",
    icon: MonitorSmartphone,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "hover:border-teal-500/35",
    stats: "LVGL APP",
  },
  {
    id: "prompts",
    title: "提示词模板库",
    description: "850+ 智能硬件产品定义、芯片选型、驱动开发和调试流程的提示词模板，支持分类筛选和快速复用。",
    icon: FileText,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "hover:border-indigo-500/35",
    stats: "850+ 模板",
  },
  {
    id: "tools",
    title: "实用工具箱",
    description: "42 个嵌入式研发常用工具与仿真实验台：CRC 校验、串口调试、PCB 计算、LVGL 转换等，即开即用。",
    icon: Wrench,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "hover:border-rose-500/35",
    stats: "42 工具",
  },
  {
    id: "mcp",
    title: "MCP Server",
    description: "接入和管理 MCP Server，将硬件生成、嵌入式调试等能力暴露给 AI 客户端调用。",
    icon: Zap,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "hover:border-cyan-500/35",
    stats: "6 工具",
  },
];

export function DashboardGrid() {
  return (
    <div className="p-6 lg:p-8">
      {/* 欢迎区 */}
      <div className="animate-fade-up mb-8">
        <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
          欢迎使用 VibeHard AI
        </h1><ModuleHelp module="dashboard" /></div>
        <p className="mt-2 text-sm text-muted-foreground">
          选择一个工具开始你的硬件研发工作流
        </p>
      </div>

      {/* 快速操作 */}
      <div className="animate-fade-up mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ animationDelay: "80ms" }}>
        {[
          { label: "本周使用", value: "12 次", highlight: false },
          { label: "已创建项目", value: "3 个", highlight: false },
          { label: "模板收藏", value: "7 个", highlight: false },
          { label: "剩余配额", value: "88%", highlight: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/80 bg-card/95 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_34px_rgba(15,23,42,0.09)]"
          >
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className={`mt-1 text-xl font-bold ${stat.highlight ? "text-primary" : "text-foreground"}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* 工具卡片网格 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool, i) => {
          const Icon = tool.icon;
          return (
            <Reveal key={tool.id} delay={i * 70} className="h-full">
              <Link
                href={`/app/${tool.id}`}
                className={`group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(15,23,42,0.1)] dark:shadow-[0_16px_42px_rgba(0,0,0,0.2)] ${tool.borderColor}`}
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/10 opacity-0 blur-[54px] transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tool.bgColor} ${tool.color} ring-1 ring-inset ring-current/20 transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {tool.stats}
                  </span>
                </div>

                <div className="relative mt-4 flex flex-1 flex-col">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
                    {tool.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                    {tool.description}
                  </p>

                  <span className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary">
                    进入工具
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>

      {/* 最近项目 */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">最近项目</h2>
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur">
          <div className="divide-y divide-border/70">
            {[
              { name: "STM32 温湿度监测节点", type: "方案生成", date: "2026-08-15", status: "已完成" },
              { name: "ESP32 智能灯控", type: "原理图识别", date: "2026-08-14", status: "进行中" },
              { name: "BLE 传感器网关", type: "芯片解析", date: "2026-08-12", status: "已完成" },
            ].map((project) => (
              <div
                key={project.name}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{project.date}</span>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${
                    project.status === "已完成"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-amber-500/10 text-amber-500"
                  }`}>
                    {project.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
