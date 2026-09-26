import Link from "next/link";
import { ArrowDown, ArrowRight, Bot, FileCheck2, GitPullRequest, PlayCircle, ShieldCheck } from "lucide-react";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 pb-14 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-24">
      <div>
        <a href="#access" aria-label="即将开放注册使用，查看开放说明" className="group mb-8 inline-flex w-full items-center justify-between gap-4 rounded-xl border border-primary bg-primary px-5 py-4 text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 sm:w-auto sm:min-w-80">
          <span>
            <span className="block text-xl font-bold tracking-tight sm:text-2xl">即将开放注册使用</span>
            <span className="mt-1.5 block text-xs font-medium text-primary-foreground/90 sm:text-sm">当前为邀请码内测 · 敬请期待</span>
          </span>
          <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
        </a>
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-muted-foreground">VIBEHARD / AI FOR HARDWARE</p>
        <h1 id="hero-title" className="text-[32px] font-bold leading-[1.2] tracking-tight min-[360px]:text-[38px] sm:text-5xl xl:text-[60px]">
          让硬件研发，<br /><span className="text-primary">有 AI 并肩协作。</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
          从需求与方案，到工程分析、受控修改和知识沉淀。<br className="hidden xl:block" />
          在一个网页工作台里，与云端 Agent 一起推进嵌入式项目。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <PlayCircle aria-hidden="true" className="h-4 w-4" />观看流程演示
          </Link>
          <a href="#capabilities" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-semibold transition-colors hover:bg-muted">
            了解平台功能<ArrowDown aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">当前采用邀请码内测，公开注册即将开放。已有账号可直接登录。</p>
      </div>
      <div aria-label="Agent 工程协作流程示意" className="relative min-w-0 rounded-2xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 text-xs">
          <span className="flex items-center gap-2 font-semibold"><Bot aria-hidden="true" className="h-4 w-4 text-primary" />Agent 项目</span>
          <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">工作流示意 · 非实时任务</span>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="ml-5 rounded-xl rounded-tr-sm bg-primary/10 p-4 text-sm leading-6">帮我分析这个嵌入式工程，先说明影响范围，确认后再修改，并给出验证报告。</div>
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background"><Bot aria-hidden="true" className="h-4 w-4 text-primary" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">先理解工程，再推进变更</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">云端分析 · 人工确认 · 证据留存</p>
              <ol className="mt-4 space-y-2.5">
                {[
                  { icon: GitPullRequest, title: "工程分析", text: "梳理目录、约束与修改计划" },
                  { icon: ShieldCheck, title: "受控修改", text: "审批敏感操作，限定本次改动范围" },
                  { icon: FileCheck2, title: "变更报告", text: "记录修改、验证结果与未验证项" },
                ].map(({ icon: Icon, title, text }, index) => (
                  <li key={title} className="flex items-start gap-3 rounded-lg border border-border bg-background/70 p-3">
                    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div><p className="text-xs font-semibold">0{index + 1} / {title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
            {["项目与会话", "流式对话", "工具审批", "项目知识版本"].map(tag => <span key={tag} className="rounded-full border border-border px-2.5 py-1">{tag}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}
