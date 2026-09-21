"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FolderKanban,
  Loader2,
  Package,
  FileDown,
  ShoppingCart,
  Zap,
  ShieldCheck,
  FlaskConical,
  Store,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { apiPath, cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  workspaceKey: string;
  defaultModel: string;
}

interface BomItem {
  ref: string;
  item: string;
  model: string;
  package: string;
  qty: number;
  unitPrice: number;
  source: "库内" | "立创商城";
  smt?: "基础库" | "推荐库" | "扩展库";
  stock: string;
  verified: boolean;
}

const bomItems: BomItem[] = [
  { ref: "U1", item: "主控 MCU", model: "ESP32-S3-WROOM-1-N8R2", package: "SMD-41", qty: 1, unitPrice: 18.5, source: "库内", stock: "126", verified: true },
  { ref: "U2", item: "温湿度传感器", model: "SHT30-DIS", package: "DFN-8", qty: 1, unitPrice: 8.2, source: "库内", stock: "88", verified: true },
  { ref: "U3", item: "光照传感器", model: "BH1750FVI", package: "WSOF-6", qty: 1, unitPrice: 2.1, source: "库内", stock: "340", verified: true },
  { ref: "U4", item: "充电管理", model: "TP4056", package: "SOP-8", qty: 1, unitPrice: 0.55, source: "立创商城", smt: "基础库", stock: "充足", verified: true },
  { ref: "U5", item: "LDO 稳压", model: "HT7833", package: "SOT-89", qty: 1, unitPrice: 0.32, source: "立创商城", smt: "基础库", stock: "充足", verified: true },
  { ref: "OLED1", item: "显示屏", model: 'SSD1306 0.96" 模组', package: "4P 排针", qty: 1, unitPrice: 9.0, source: "库内", stock: "52", verified: true },
  { ref: "J1", item: "USB-C 母座", model: "TYPE-C-16P", package: "SMD-16P", qty: 1, unitPrice: 0.85, source: "立创商城", smt: "推荐库", stock: "充足", verified: true },
  { ref: "BAT1", item: "电池座", model: "18650 单节", package: "插件", qty: 1, unitPrice: 2.3, source: "立创商城", stock: "充足", verified: true },
  { ref: "R1,R2", item: "分压电阻", model: "100K ±1%", package: "0603", qty: 2, unitPrice: 0.01, source: "立创商城", smt: "基础库", stock: "充足", verified: true },
  { ref: "C1-C5", item: "去耦电容", model: "100nF ±10%", package: "0603", qty: 5, unitPrice: 0.008, source: "立创商城", smt: "基础库", stock: "充足", verified: true },
  { ref: "C6,C7", item: "滤波电容", model: "10µF ±20%", package: "0805", qty: 2, unitPrice: 0.05, source: "立创商城", smt: "基础库", stock: "充足", verified: true },
];

const totalCost = bomItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

/* -------------------- 物料库 -------------------- */

interface StockItem {
  model: string;
  category: string;
  spec: string;
  stock: number;
  status: "已验证" | "待审核" | "已学习未验证";
}

const stockItems: StockItem[] = [
  { model: "ESP32-S3-WROOM-1", category: "核心板库", spec: "Wi-Fi+BLE · 8MB Flash", stock: 126, status: "已验证" },
  { model: "STM32F103 核心板", category: "核心板库", spec: "72MHz · 64KB Flash", stock: 84, status: "已验证" },
  { model: "ESP32-C3-MINI", category: "核心板库", spec: "Wi-Fi+BLE · RISC-V", stock: 230, status: "待审核" },
  { model: "SHT30-DIS", category: "传感器库", spec: "温湿度 · I2C · ±2%RH", stock: 88, status: "已验证" },
  { model: "BH1750FVI", category: "传感器库", spec: "光照 · I2C · 1-65535lx", stock: 340, status: "已验证" },
  { model: "DS18B20", category: "传感器库", spec: "温度 · 单总线 · ±0.5°C", stock: 175, status: "已学习未验证" },
  { model: "MPU6050", category: "传感器库", spec: "6 轴 IMU · I2C", stock: 96, status: "待审核" },
  { model: "TP4056 充电模块", category: "电源管理", spec: "1A 锂电充电 · 带保护", stock: 412, status: "已验证" },
  { model: "HT7833", category: "电源管理", spec: "LDO 3.3V · 500mA", stock: 830, status: "已验证" },
];

const stockCategories = ["全部", "核心板库", "传感器库", "电源管理"];

export default function BomPage() {
  const [category, setCategory] = useState("全部");
  const [exported, setExported] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(apiPath("/api/projects"), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { projects?: Project[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "工程列表加载失败");
        return data.projects ?? [];
      })
      .then((loadedProjects) => {
        if (!active) return;
        setProjects(loadedProjects);
        setSelectedProjectId(loadedProjects[0]?.id ?? "");
      })
      .catch((reason) => {
        if (active) setProjectsError(reason instanceof Error ? reason.message : "工程列表加载失败");
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const filteredStock = useMemo(
    () => stockItems.filter((s) => category === "全部" || s.category === category),
    [category]
  );

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="bom"
        icon={Package}
        title="物料与 BOM"
        description="从物料库自动选型组合生成 BOM，一键导出或对接立创商城下单、SMT 贴片"
      />

      {/* 方案 BOM */}
      {projectsLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-border/80 bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载工程...
        </div>
      ) : projectsError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-500">{projectsError}</p>
          <p className="mt-2 text-xs text-muted-foreground">请刷新页面后重试。</p>
        </div>
      ) : !selectedProject ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/60 px-6 py-12 text-center">
          <FolderKanban className="h-10 w-10 text-primary/70" />
          <h2 className="mt-4 text-base font-semibold text-foreground">暂无工程，暂时没有 BOM</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            先创建一个工程并生成方案，当前工程的物料清单会显示在这里。
          </p>
          <Link
            href="/app/agent"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            去创建工程
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              当前工程 BOM
              <select
                aria-label="选择工程"
                value={selectedProject.id}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setExported(false);
                }}
                className="max-w-56 truncate rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary outline-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setExported(true)}
                disabled={exported}
              >
                <FileDown className="h-4 w-4" />
                {exported ? "已导出 BOM.csv" : "导出 BOM"}
              </Button>
              <Button variant="outline" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                立创一键下单
              </Button>
              <Button className="gap-2">
                <Zap className="h-4 w-4" />
                一键 SMT 贴片
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/70 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">位号</th>
                  <th className="px-3 py-2 text-left font-medium">物料</th>
                  <th className="px-3 py-2 text-left font-medium">型号 / 封装</th>
                  <th className="px-3 py-2 text-right font-medium">数量</th>
                  <th className="px-3 py-2 text-right font-medium">单价</th>
                  <th className="px-3 py-2 text-right font-medium">小计</th>
                  <th className="px-3 py-2 text-left font-medium">来源</th>
                  <th className="px-3 py-2 text-right font-medium">库存</th>
                </tr>
              </thead>
              <tbody>
                {bomItems.map((item) => (
                  <tr key={item.ref} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.ref}</td>
                    <td className="px-3 py-2 text-foreground">{item.item}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-medium text-foreground">{item.model}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{item.package}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{item.qty}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">¥{item.unitPrice.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium text-foreground">
                      ¥{(item.unitPrice * item.qty).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      {item.source === "库内" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-500">
                          <ShieldCheck className="h-3 w-3" />
                          库内·已验证
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-blue-500">
                          <Store className="h-3 w-3" />
                          立创{item.smt ? `·${item.smt}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.stock}</td>
                  </tr>
                ))}
                <tr className="bg-background/70">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-medium text-muted-foreground">
                    单板物料合计（不含 PCB 板费与贴片费）
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold text-primary">
                    ¥{totalCost.toFixed(2)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            当前展示的是该工程的方案 BOM；库内已验证物料优先，库外器件按基础库 → 推荐库 → 扩展库匹配
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        当前工程 BOM 与下方全局物料库相互独立；物料库中的器件不会自动计入工程 BOM。
      </p>

      {/* 物料库 */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">物料库</h3>
          <div className="flex flex-wrap gap-2">
            {stockCategories.map((c) => (
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

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background/70 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">型号</th>
                <th className="px-4 py-2.5 text-left font-medium">类别</th>
                <th className="px-4 py-2.5 text-left font-medium">关键参数</th>
                <th className="px-4 py-2.5 text-right font-medium">库存</th>
                <th className="px-4 py-2.5 text-right font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.map((s) => (
                <tr key={s.model} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-foreground">{s.model}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.category}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.spec}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{s.stock}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        s.status === "已验证"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : s.status === "待审核"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-violet-500/10 text-violet-500"
                      )}
                    >
                      {s.status === "已验证" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <FlaskConical className="h-3 w-3" />
                      )}
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          「已学习未验证」：来自开源原理图切片学习，待硬件工程师审核后方可用于生成
        </p>
      </div>
    </div>
  );
}
