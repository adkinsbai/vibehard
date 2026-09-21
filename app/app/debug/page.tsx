"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bug,
  Loader2,
  Cable,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  CircleDashed,
  Usb,
  Unplug,
  SquareTerminal,
  FileDown,
  RotateCcw,
  Square,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* -------------------- 调试脚本（mock 数据） -------------------- */

type LineLevel = "info" | "ok" | "warn" | "action";

interface DebugStep {
  periph: string;
  name: string;
  /** true 表示该外设经历过 AI 自动修复 */
  fixed?: boolean;
  lines: { level: LineLevel; text: string }[];
}

const debugScript: DebugStep[] = [
  {
    periph: "i2c",
    name: "I2C0 总线",
    lines: [
      { level: "info", text: "初始化 I2C0 @ 400kHz（SDA=GPIO8, SCL=GPIO9）" },
      { level: "info", text: "总线扫描完成：发现 0x44 / 0x23 / 0x3C 共 3 个设备" },
      { level: "ok", text: "I2C0 总线已调通" },
    ],
  },
  {
    periph: "sht30",
    name: "SHT30 温湿度",
    lines: [
      { level: "info", text: "读取 SHT30（0x44）周期性测量模式..." },
      { level: "info", text: "采样 26.4°C / 61%RH，CRC 校验通过，数值在合理区间" },
      { level: "ok", text: "SHT30 温湿度已调通" },
    ],
  },
  {
    periph: "bh1750",
    name: "BH1750 光照",
    fixed: true,
    lines: [
      { level: "info", text: "读取 BH1750（0x23）连续高分辨率模式..." },
      { level: "warn", text: "首次读取超时（ACK 异常），疑似总线上拉偏弱" },
      { level: "action", text: "AI 决策：I2C0 降速 400kHz → 100kHz，延时重试" },
      { level: "info", text: "重试成功：428 lux，连续 10 次采样稳定" },
      { level: "ok", text: "BH1750 光照已调通（已自动降速修复）" },
    ],
  },
  {
    periph: "oled",
    name: "SSD1306 OLED",
    lines: [
      { level: "info", text: "初始化 SSD1306（0x3C），写入测试帧..." },
      { level: "info", text: "帧缓冲渲染校验通过（128×64），对比度正常" },
      { level: "ok", text: "SSD1306 OLED 已调通" },
    ],
  },
  {
    periph: "adc",
    name: "ADC 电量采集",
    lines: [
      { level: "info", text: "GPIO34 采集电池分压，32 次过采样..." },
      { level: "info", text: "原始值 2486 → 3.92V（分压比 11:1 校准通过）" },
      { level: "ok", text: "ADC 电量采集已调通" },
    ],
  },
  {
    periph: "wifi",
    name: "Wi-Fi 连接",
    lines: [
      { level: "info", text: "连接 AP「Lab-2.4G」（WPA2）..." },
      { level: "info", text: "DHCP 获取 192.168.31.86，RSSI -52dBm，MQTT 云端握手成功" },
      { level: "ok", text: "Wi-Fi 连接已调通" },
    ],
  },
  {
    periph: "chg",
    name: "TP4056 充电",
    lines: [
      { level: "info", text: "读取 TP4056 CHRG / STDBY 状态引脚..." },
      { level: "info", text: "当前状态：未充电（电池 87%，无需充电）" },
      { level: "ok", text: "TP4056 充电管理已调通" },
    ],
  },
];

interface TermLine {
  time: string;
  level: LineLevel;
  text: string;
}

type RunState = "idle" | "running" | "done" | "stopped";

export default function DebugPage() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [lines, setLines] = useState<TermLine[]>([]);
  const [periphState, setPeriphState] = useState<Record<string, "wait" | "active" | "done" | "fixed">>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const termRef = useRef<HTMLDivElement>(null);

  const doneCount = debugScript.filter(
    (s) => periphState[s.periph] === "done" || periphState[s.periph] === "fixed"
  ).length;

  // 终端自动滚到底部
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnected(true);
      setConnecting(false);
    }, 1200);
  };

  const pushLine = (level: LineLevel, text: string) => {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLines((prev) => [...prev, { time, level, text }]);
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const start = () => {
    if (!connected || runState === "running") return;
    clearTimers();
    setLines([]);
    setPeriphState({});
    setRunState("running");

    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    let t = 600;

    later(300, () => pushLine("action", "AI 调试会话已建立，开始逐项调试板载外设（共 7 项）"));

    for (const step of debugScript) {
      later(t, () => {
        setPeriphState((p) => ({ ...p, [step.periph]: "active" }));
        pushLine("info", `──── ${step.name} ────`);
      });
      t += 500;
      for (const line of step.lines) {
        later(t, () => pushLine(line.level, line.text));
        t += line.level === "ok" ? 700 : 620;
      }
      later(t, () =>
        setPeriphState((p) => ({ ...p, [step.periph]: step.fixed ? "fixed" : "done" }))
      );
      t += 400;
    }

    later(t + 300, () => {
      pushLine("ok", "全部外设调试完成：7/7 调通（1 项经 AI 自动修复），固件配置已同步保存");
      setRunState("done");
    });
  };

  const stop = () => {
    clearTimers();
    pushLine("warn", "调试已被手动停止");
    setRunState("stopped");
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="debug"
        icon={Bug}
        title="AI 调试"
        description="连接接入全部外设的开发板，AI 自动逐项调试并流式输出过程，异常自动给出修复策略"
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
                ESP32-S3-WROOM-1 · TH-Node v0.1 · 已接入 7 个外设模块 · OpenOCD 链路就绪
              </p>
            </div>
            {runState === "running" ? (
              <Button variant="outline" className="gap-2" onClick={stop}>
                <Square className="h-4 w-4" />
                停止调试
              </Button>
            ) : (
              <Button onClick={start} className="gap-2">
                <Bug className="h-4 w-4" />
                {runState === "done" || runState === "stopped" ? "重新调试" : "启动 AI 调试"}
              </Button>
            )}
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
                请确认开发板已接入全部所需外设模块，通过 USB 连接后建立调试会话
              </p>
            </div>
            <Button onClick={connect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
              {connecting ? "连接中..." : "连接开发板"}
            </Button>
          </>
        )}
      </div>

      {/* 进度条 */}
      {runState !== "idle" && (
        <div className="animate-fade-up mb-6 rounded-xl border border-border/80 bg-card px-5 py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              调试进度
              {runState === "done" && <span className="ml-2 text-emerald-500">全部调通</span>}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {doneCount} / {debugScript.length} 外设
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / debugScript.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 左：外设清单 */}
        <div className="rounded-xl border border-border/80 bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">外设清单</h3>
          <div className="space-y-2">
            {debugScript.map((s) => {
              const st = periphState[s.periph] ?? "wait";
              return (
                <div
                  key={s.periph}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    st === "active"
                      ? "border-primary/40 bg-primary/5"
                      : st === "done" || st === "fixed"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-border/60 bg-background/70"
                  )}
                >
                  {st === "wait" && <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                  {st === "active" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                  {st === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {st === "fixed" && <Wrench className="h-4 w-4 shrink-0 text-amber-500" />}
                  <span
                    className={cn(
                      "flex-1 text-sm font-medium",
                      st === "wait" ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {s.name}
                  </span>
                  {st === "fixed" && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                      自动修复
                    </span>
                  )}
                  {(st === "done" || st === "fixed") && (
                    <span className="text-[11px] font-medium text-emerald-500">已调通</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：流式调试终端 */}
        <div className="rounded-xl border border-border/80 bg-card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SquareTerminal className="h-4 w-4 text-primary" />
              调试输出
            </h3>
            {runState === "done" && (
              <Button variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
                <FileDown className="h-3.5 w-3.5" />
                导出调试报告
              </Button>
            )}
          </div>
          <div
            ref={termRef}
            className="h-[420px] overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-6"
          >
            {lines.length === 0 ? (
              <p className="text-zinc-600">
                {connected ? "// 点击「启动 AI 调试」开始" : "// 请先连接开发板"}
              </p>
            ) : (
              lines.map((l, i) => (
                <p key={i} className="animate-fade-up">
                  <span className="text-zinc-600">[{l.time}]</span>{" "}
                  <span
                    className={cn(
                      l.level === "ok" && "text-emerald-400",
                      l.level === "warn" && "text-amber-400",
                      l.level === "action" && "text-violet-400",
                      l.level === "info" && "text-zinc-300"
                    )}
                  >
                    {l.level === "ok" && "✓ "}
                    {l.level === "warn" && "⚠ "}
                    {l.level === "action" && "⚡ "}
                    {l.text}
                  </span>
                </p>
              ))
            )}
            {runState === "running" && (
              <p className="mt-1 flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                AI 正在调试...
              </p>
            )}
          </div>

          {/* 完成操作 */}
          {runState === "done" && (
            <div className="animate-fade-up mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="flex-1 text-xs text-foreground">
                全部外设调通，调试配置（I2C 降速 100kHz）已写入固件，可进入嵌入式开发
              </p>
              <Button variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={start}>
                <RotateCcw className="h-3.5 w-3.5" />
                重新调试
              </Button>
              <Link
                href="/app/embedded"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                前往嵌入式开发
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 底部提示 */}
      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        AI 调试通过 OpenOCD 链路直接读写寄存器与总线，调试中请勿断开 USB；发现的硬件问题会自动反哺到硬件设计环节
      </p>
    </div>
  );
}
