"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircuitBoard, FileDown, Info, Loader2, Package } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { PcbPreview } from "@/components/pcb/pcb-preview";
import { cn } from "@/lib/utils";

const pipelineSteps = [
  { title: "载入示例电路", desc: "ESP32-S3、USB-C、温湿度与光照传感器、电源管理" },
  { title: "整理器件布局", desc: "模组天线靠板边，区分传感、电源与接口区域" },
  { title: "载入布线预览", desc: "双层铜线、加宽电源路径、接地过孔与天线净空" },
  { title: "生成装配预览", desc: "焊盘、封装、丝印与器件材质已载入" },
];

export default function PcbPage() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const generate = () => {
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    setState("running");
    setStep(0);
    pipelineSteps.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStep(i + 1), 900 * (i + 1)));
    });
    timers.current.push(setTimeout(() => setState("done"), 900 * pipelineSteps.length + 500));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader helpKey="pcb" icon={CircuitBoard} title="PCB 生成" description="从器件布局到板级装配，查看 PCB 走线、封装与接口细节" />
      <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,2.15fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-border/80 bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">来源与板框参数</h3><span className="text-[11px] text-muted-foreground">示例工程</span></div>
            <dl className="space-y-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-3"><dt className="text-muted-foreground">来源方案</dt><dd className="font-medium">温湿度监测节点 v0.2</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">板框尺寸</dt><dd className="font-mono">50 × 35 mm</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">层数 / 板厚</dt><dd className="font-mono">2 层 · 1.6 mm</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">主控模组</dt><dd className="font-mono">ESP32-S3-WROOM-1</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">接口</dt><dd>USB-C / 电池 / I2C</dd></div>
            </dl>
            <Button onClick={generate} disabled={state === "running"} className="mt-5 w-full gap-2">
              {state === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircuitBoard className="h-4 w-4" />}
              {state === "running" ? "生成中..." : state === "done" ? "重新生成" : "开始生成 PCB"}
            </Button>
          </div>
          {state !== "idle" && (
            <div className="rounded-lg border border-border/80 bg-card p-5" aria-live="polite">
              <h3 className="mb-4 text-sm font-semibold">生成流水线</h3>
              <ol className="space-y-4">
                {pipelineSteps.map((item, i) => {
                  const done = i < step;
                  const active = i === step && state === "running";
                  return (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", done ? "bg-emerald-500/10 text-emerald-500" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                      </span>
                      <div><p className={cn("text-xs font-medium", done || active ? "text-foreground" : "text-muted-foreground")}>{item.title}</p>{(done || active) && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>}</div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
        <div className="min-w-0 self-start rounded-lg border border-border/80 bg-card p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">PCB 预览</h3>
            {state === "done" && <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3.5" />示例预览已生成</span>}
          </div>
          {state === "done" ? (
            <div className="animate-fade-up">
              <PcbPreview />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Info className="size-3.5 shrink-0" />示例布局 · DRC 与生产文件待 EDA 工程验证</p>
                <Link href="/app/bom" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"><Package className="size-3.5" />查看 BOM<ArrowRight className="size-3.5" /></Link>
              </div>
              <Button variant="outline" className="mt-3 gap-2" disabled title="完成 EDA 工程验证后可导出生产文件"><FileDown className="size-4" />导出 Gerber</Button>
            </div>
          ) : (
            <div className="flex aspect-[3/2] flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-background/50" role="status">
              {state === "running" ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">{pipelineSteps[Math.min(step, pipelineSteps.length - 1)].title}...</p>
                  <div className="mt-5 flex gap-1.5">{pipelineSteps.map((s, i) => <span key={s.title} className={cn("h-1 w-8 rounded-sm", i < step ? "bg-primary" : "bg-primary/15")} />)}</div>
                </>
              ) : (
                <>
                  <CircuitBoard className="h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-4 text-sm text-muted-foreground">温湿度监测节点</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">ESP32-S3 / 50 × 35 mm / 2 层</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
