"use client";

import { useRef, useState } from "react";
import {
  MonitorSmartphone,
  Loader2,
  Cable,
  CheckCircle2,
  Sparkles,
  Play,
  Cpu,
  FileCode,
  Usb,
  Unplug,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const example = "屏幕上居中显示当前温湿度和光照值，顶部显示 Wi-Fi 信号和电量，数据每 5 秒刷新一次，温度超过 30°C 时数值变红。";

const genSteps = [
  { title: "解析需求", desc: "识别显示元素：温度、湿度、光照、Wi-Fi 状态、电量" },
  { title: "匹配板载资源", desc: "SSD1306 OLED (I2C0) + SHT30 + BH1750，驱动代码复用库中已验证版本" },
  { title: "生成 LVGL 界面", desc: "布局 3 个数据显示卡片 + 顶部状态栏，绑定阈值变色逻辑" },
  { title: "模拟器验证", desc: "渲染检查通过：无文本溢出，刷新周期 5s 正常" },
];

const genFiles = [
  { name: "main.c", desc: "入口：初始化外设、创建 5s 刷新任务", lines: 86 },
  { name: "ui_dashboard.c", desc: "LVGL 界面：状态栏 + 数据卡片 + 阈值变色", lines: 214 },
  { name: "sht30_driver.c", desc: "传感器驱动（库内已验证，直接复用）", lines: 132 },
];

export default function EmbeddedPage() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [requirement, setRequirement] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [step, setStep] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [flashed, setFlashed] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnected(true);
      setConnecting(false);
    }, 1200);
  };

  const generate = () => {
    if (!requirement.trim() || state === "running") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState("running");
    setStep(0);
    setFlashed(false);
    genSteps.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStep(i + 1), 800 * (i + 1)));
    });
    timers.current.push(setTimeout(() => setState("done"), 800 * genSteps.length + 400));
  };

  const flash = () => {
    setFlashing(true);
    setTimeout(() => {
      setFlashing(false);
      setFlashed(true);
    }, 2500);
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="embedded"
        icon={MonitorSmartphone}
        title="嵌入式开发"
        description="连接开发板，用自然语言生成运行在板子上的嵌入式 APP，模拟器验证后一键烧录"
      />

      {/* 连接开发板 */}
      <div
        className={cn(
          "mb-6 flex flex-wrap items-center gap-4 rounded-xl border px-5 py-4 transition-colors",
          connected ? "border-emerald-500/25 bg-emerald-500/5" : "border-border/80 bg-card"
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            connected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
          )}
        >
          <Usb className="h-5 w-5" />
        </div>
        {connected ? (
          <>
            <div className="flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                开发板已连接
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                ESP32-S3-WROOM-1 · TH-Node v0.1 · USB-JTAG @ 115200 · Flash 8MB
              </p>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => setConnected(false)}>
              <Unplug className="h-4 w-4" />
              断开
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">未连接开发板</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                通过 USB 连接开发板后，使用 Web Serial 建立会话（也可先离线生成，拿到板子再烧录）
              </p>
            </div>
            <Button onClick={connect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
              {connecting ? "连接中..." : "连接开发板"}
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 左：需求输入 + 流水线 */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">用自然语言描述想要的 APP</label>
              <button
                onClick={() => setRequirement(example)}
                className="text-xs font-medium text-primary hover:underline"
              >
                填入示例
              </button>
            </div>
            <Textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="例如：屏幕上显示温湿度，温度超过 30°C 变红报警..."
              className="min-h-[110px]"
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                AI 会自动匹配板载传感器与屏幕驱动，生成 LVGL 界面代码
              </span>
              <Button onClick={generate} disabled={!requirement.trim() || state === "running"} className="gap-2">
                {state === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {state === "running" ? "生成中..." : "生成 APP"}
              </Button>
            </div>
          </div>

          {/* 生成流水线 */}
          {state !== "idle" && (
            <div className="animate-fade-up rounded-xl border border-border/80 bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">生成过程</h3>
              <div className="space-y-3">
                {genSteps.map((s, i) => {
                  const done = i < step;
                  const active = i === step && state === "running";
                  return (
                    <div key={s.title} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          done
                            ? "bg-emerald-500/10 text-emerald-500"
                            : active
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : active ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <span className="text-[10px] font-bold">{i + 1}</span>
                        )}
                      </span>
                      <div>
                        <p className={cn("text-sm font-medium", done || active ? "text-foreground" : "text-muted-foreground")}>
                          {s.title}
                        </p>
                        {(done || active) && (
                          <p className="animate-fade-up mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 生成文件 */}
          {state === "done" && (
            <div className="animate-fade-up rounded-xl border border-border/80 bg-card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileCode className="h-4 w-4 text-primary" />
                生成文件
              </h3>
              <div className="space-y-2">
                {genFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <code className="font-mono text-xs font-semibold text-foreground">{f.name}</code>
                    <span className="flex-1 truncate text-xs text-muted-foreground">{f.desc}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{f.lines} 行</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：屏幕模拟器 */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">屏幕模拟器</h3>
              <span className="font-mono text-[11px] text-muted-foreground">SSD1306 · 128×64</span>
            </div>

            {/* 屏幕框 */}
            <div className="mx-auto w-fit rounded-2xl border border-border/80 bg-zinc-900 p-3 shadow-inner">
              <div className="h-[180px] w-[300px] overflow-hidden rounded-md bg-black font-mono">
                {state === "done" ? (
                  <ScreenMock />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-[11px] text-zinc-600">
                      {state === "running" ? "渲染中..." : "生成 APP 后在此预览"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 操作 */}
            {state === "done" && (
              <div className="animate-fade-up mt-4 space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  模拟器验证通过：布局无溢出，5s 刷新正常
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2">
                    <Play className="h-4 w-4" />
                    重新模拟
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={flash}
                    disabled={!connected || flashing || flashed}
                    title={connected ? undefined : "请先连接开发板"}
                  >
                    {flashing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Cpu className="h-4 w-4" />
                    )}
                    {flashing ? "烧录中..." : flashed ? "已烧录 ✓" : "烧录到开发板"}
                  </Button>
                </div>
                {!connected && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    连接开发板后即可烧录
                  </p>
                )}
                {flashed && (
                  <p className="animate-fade-up text-center text-[11px] font-medium text-emerald-500">
                    烧录完成，开发板已重启运行新 APP
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- OLED 屏幕内容 mock -------------------- */

function ScreenMock() {
  return (
    <div className="flex h-full flex-col p-2.5 text-zinc-100">
      {/* 状态栏 */}
      <div className="flex items-center justify-between border-b border-zinc-700 pb-1.5 text-[9px] text-zinc-300">
        <span>TH-Node</span>
        <div className="flex items-center gap-2">
          <span>Wi-Fi ▂▄▆</span>
          <span>🔋 87%</span>
        </div>
      </div>
      {/* 数据区 */}
      <div className="grid flex-1 grid-cols-3 items-center gap-2 py-2">
        <div className="text-center">
          <p className="text-[8px] text-zinc-400">温度</p>
          <p className="mt-1 text-lg font-bold text-red-400">31.2°</p>
          <p className="text-[8px] text-red-400/80">偏高</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-zinc-400">湿度</p>
          <p className="mt-1 text-lg font-bold">58%</p>
          <p className="text-[8px] text-zinc-500">正常</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-zinc-400">光照</p>
          <p className="mt-1 text-lg font-bold">426</p>
          <p className="text-[8px] text-zinc-500">lux</p>
        </div>
      </div>
      {/* 底栏 */}
      <div className="border-t border-zinc-700 pt-1 text-center text-[8px] text-zinc-500">
        5s 前更新 · 数据已上报
      </div>
    </div>
  );
}
