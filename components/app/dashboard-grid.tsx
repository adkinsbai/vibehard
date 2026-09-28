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
  Usb,
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
    description: "提交需求后自动创建或关联项目，由后台生成架构、BOM、接口与风险建议，结果可从项目恢复。",
    icon: Layers,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "hover:border-blue-500/35",
    stats: "后台任务",
  },
  {
    id: "datasheets",
    title: "芯片资料解析",
    description: "查看芯片资料解析流程演示。正式资料的收录与检索通过知识库和方案生成流程进行。",
    icon: BookOpen,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "hover:border-amber-500/35",
    stats: "流程演示",
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
    description: "查看 PCB 预览与现有设计入口。布局布线、制造文件及外壳模型依具体工程与验收结果提供。",
    icon: CircuitBoard,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "hover:border-violet-500/35",
    stats: "PCB 预览",
  },
  {
    id: "bom",
    title: "物料与 BOM",
    description: "查看工程已完成方案的 BOM，核对候选型号和模型估算价格，并下载实际 CSV 文件。",
    icon: Package,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "hover:border-orange-500/35",
    stats: "方案 BOM",
  },
  {
    id: "taishan",
    title: "设备开发 · RV1126B",
    description: "打开独立 VibeBoard，使用已验收的网页应用生成、在线电脑 USB/ADB 部署与真机截图；需另行登录和绑定设备。",
    icon: Usb,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "hover:border-cyan-500/35",
    stats: "USB/ADB",
  },
  {
    id: "embedded",
    title: "嵌入式开发",
    description: "查看嵌入式开发流程演示；实际 RV1126B 网页应用部署请从“设备开发”入口使用。",
    icon: MonitorSmartphone,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "hover:border-teal-500/35",
    stats: "流程演示",
  },
  {
    id: "prompts",
    title: "提示词模板库",
    description: "浏览现有提示词示例，按类别筛选并复制到自己的研发流程中使用。",
    icon: FileText,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    borderColor: "hover:border-indigo-500/35",
    stats: "模板示例",
  },
  {
    id: "tools",
    title: "实用工具箱",
    description: "浏览嵌入式研发工具目录；不同工具的浏览器和设备要求以各自页面说明为准。",
    icon: Wrench,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "hover:border-rose-500/35",
    stats: "工具目录",
  },
  {
    id: "mcp",
    title: "MCP Server",
    description: "查看 MCP 能力目录和接入说明。服务注册与实际调用能力以已验证的接口为准。",
    icon: Zap,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "hover:border-cyan-500/35",
    stats: "能力目录",
  },
];

export type DashboardProject = { id: string; name: string; updatedAt: string };
export type DashboardJob = { id: string; projectName: string; status: string; createdAt: string };

export function DashboardGrid({ projects, jobs, designUnavailable = false }: {
  projects: DashboardProject[];
  jobs: DashboardJob[];
  designUnavailable?: boolean;
}) {
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

      <div className="animate-fade-up mb-8 grid gap-3 sm:grid-cols-2" style={{ animationDelay: "80ms" }}>
        <Link href="/app/agent" className="rounded-xl border border-border/80 bg-card/95 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_34px_rgba(15,23,42,0.09)]">
          <p className="text-xs font-medium text-muted-foreground">我的 Agent 项目</p>
          <p className="mt-1 text-xl font-bold text-primary">{projects.length} 个</p>
        </Link>
        <Link href="/app/design" className="rounded-xl border border-border/80 bg-card/95 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_34px_rgba(15,23,42,0.09)]">
          <p className="text-xs font-medium text-muted-foreground">最近方案任务</p>
          <p className="mt-1 text-xl font-bold text-foreground">{designUnavailable ? "暂时无法读取" : jobs[0] ? ({ completed: "已完成", failed: "失败", queued: "排队中", running: "生成中" } as Record<string, string>)[jobs[0].status] ?? jobs[0].status : "暂无记录"}</p>
        </Link>
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
            {projects.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">还没有项目。生成方案时会自动创建，也可以从 Agent 项目工作台新建。</p>}
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/app/agent?project=${encodeURIComponent(project.id)}`}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{project.name}</p>
                    <p className="text-xs text-muted-foreground">Agent 项目</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{new Date(project.updatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
