import Link from "next/link";
import { ArrowRight } from "lucide-react";

const questions = [
  { question: "现在可以注册使用吗？", answer: "平台目前处于邀请码内测阶段，即将开放注册使用，具体开放时间以官网公告为准。已有账号可登录；持有邀请码的内测用户可通过本页邀请码入口注册。" },
  { question: "知识库里的资料都能直接使用吗？", answer: "研发目录仅供管理员和开发者浏览，当前不提供原始文件下载。项目知识采用独立审核流程：用户申请，管理员或开发者发布后，才供对应项目的 Agent 使用。" },
  { question: "网页能直接完成烧录和调试吗？", answer: "云端 Agent 负责工程分析与执行任务。真实 USB、串口和烧录需要现场电脑连接设备，并配置设备执行节点及对应工具链；硬件适配仍在验证，演示流程不等于实机成功。" },
];

export function CTASection() {
  return (
    <section id="access" aria-labelledby="access-title" className="relative z-10 mx-auto max-w-7xl scroll-mt-24 px-6 py-20">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-7 sm:p-9">
          <span className="text-xs font-semibold tracking-[0.15em] text-primary">COMING SOON</span>
          <h2 id="access-title" className="mt-4 text-3xl font-bold leading-tight tracking-tight text-primary sm:text-4xl">即将开放注册使用</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">我们正在打磨云端 Agent、研发工具与知识协作体验。正式开放前，欢迎先通过演示了解 VibeHard。</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">先看演示<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-semibold hover:bg-muted">已有账号登录</Link>
          </div>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">已获内测邀请？<Link href="/register" className="ml-1 font-medium text-primary underline underline-offset-4">使用已有邀请码注册</Link></p>
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">开始之前，你可能想了解</h3>
          {questions.map(item => (
            <details key={item.question} className="border-b border-border py-5">
              <summary className="cursor-pointer text-sm font-semibold marker:text-primary">{item.question}</summary>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
