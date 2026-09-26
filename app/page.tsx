import type { Metadata } from "next";
import { CTASection } from "@/components/home/cta-section";
import { HeroSection } from "@/components/home/hero-section";
import { HomeNav } from "@/components/home/home-nav";
import { StatsSection } from "@/components/home/stats-section";
import { WorkflowSection } from "@/components/home/workflow-section";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "VibeHard — AI 硬件研发工作台 · 即将开放注册",
  description: "与云端 Agent 协作完成工程分析、受控修改与变更报告，探索硬件方案、BOM 和知识审核。VibeHard 目前处于邀请码内测阶段，即将开放注册使用。",
};

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-14rem] h-[42rem] w-[68rem] -translate-x-1/2 rounded-full bg-primary/[0.09] blur-[150px]" />
        <div className="auth-grid absolute inset-0 opacity-[0.16] dark:opacity-25" />
      </div>

      <HomeNav />
      <HeroSection />
      <StatsSection />
      <WorkflowSection />
      <CTASection />
      <Footer />
    </main>
  );
}
