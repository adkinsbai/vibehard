"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  Upload,
  FileText,
  Loader2,
  Search,
  Globe,
  Sparkles,
  FileJson,
  CheckCircle2,
  Database,
  Download,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* -------------------- 全网检索 + AI 解析流水线 -------------------- */

interface FoundSource {
  title: string;
  site: string;
  kind: "Datasheet" | "引脚图" | "参考原理图";
}

interface SkillRun {
  name: string;
  desc: string;
  output: string;
}

const mockSources: FoundSource[] = [
  { title: "esp32-s3_datasheet_en.pdf (v1.7)", site: "espressif.com", kind: "Datasheet" },
  { title: "ESP32-S3-WROOM-1 引脚定义图", site: "espressif.com", kind: "引脚图" },
  { title: "ESP32-S3 最小系统参考设计", site: "立创开源广场", kind: "参考原理图" },
  { title: "esp32-s3-eye 开发板原理图", site: "github.com", kind: "参考原理图" },
  { title: "S3 传感器节点开源工程", site: "oshwhub.com", kind: "参考原理图" },
];

const mockSkills: SkillRun[] = [
  { name: "datasheet-extract", desc: "提取电气参数、封装、时序与绝对最大额定值", output: "识别 214 项参数，置信度 98.2%" },
  { name: "pinout-map", desc: "解析引脚图，建立引脚-功能-复用映射表", output: "45 个 GPIO 全部映射，9 组电源引脚" },
  { name: "schematic-slice-verify", desc: "切片参考原理图并与 datasheet 交叉验证", output: "3 份参考电路通过验证，最小系统电路已入库" },
];

const chipProfileJson = `{
  "chip": "ESP32-S3-WROOM-1-N8R2",
  "category": "core-board",
  "verified": true,
  "summary": "Wi-Fi + BLE5 双模 MCU，Xtensa LX7 双核 240MHz，8MB Flash + 2MB PSRAM",
  "power": {
    "vcc": { "min": 3.0, "typ": 3.3, "max": 3.6, "unit": "V" },
    "current_active_ma": 240,
    "current_deepsleep_ua": 8
  },
  "package": "SMD-41 (18×25.5mm)",
  "interfaces": {
    "i2c": [{ "sda": "GPIO8", "scl": "GPIO9", "max_khz": 1000 }],
    "spi": [{ "mosi": "GPIO11", "miso": "GPIO13", "sck": "GPIO12", "cs": "GPIO10" }],
    "uart": [{ "tx": "GPIO43", "rx": "GPIO44" }],
    "usb": { "dp": "GPIO20", "dm": "GPIO19", "note": "内置 USB-OTG，免 USB 转串口" }
  },
  "constraints": [
    "Strapping 引脚 GPIO0/3/45/46 上电时序需注意",
    "Flash/PSRAM 占用 GPIO26-32，用户不可用",
    "每个 VDD 引脚就近放置 100nF + 10µF 去耦"
  ],
  "reference_circuit": "lib://circuits/esp32-s3-minimal-v3",
  "symbols": { "eda": "lcsc://C2913202", "footprint": "lcsc://ESP32-S3-WROOM-1" }
}`;

const mockPins = [
  { pin: "2", name: "GND", type: "电源", desc: "接地" },
  { pin: "41", name: "VDD3P3", type: "电源", desc: "3.3V 供电，需就近去耦" },
  { pin: "14", name: "GPIO8", type: "I/O", desc: "I2C0_SDA / 触摸 T8" },
  { pin: "15", name: "GPIO9", type: "I/O", desc: "I2C0_SCL / BOOT" },
  { pin: "38", name: "GPIO19", type: "I/O", desc: "USB_D-" },
  { pin: "39", name: "GPIO20", type: "I/O", desc: "USB_D+" },
];

const mockElectrical = [
  { label: "工作电压", min: "3.0", typ: "3.3", max: "3.6", unit: "V" },
  { label: "工作电流 (Wi-Fi TX)", min: "-", typ: "240", max: "350", unit: "mA" },
  { label: "深度休眠电流", min: "-", typ: "8", max: "10", unit: "µA" },
  { label: "工作温度", min: "-40", typ: "25", max: "85", unit: "°C" },
];

const exampleChips = ["ESP32-S3-WROOM-1", "SHT30-DIS", "STM32F103C8T6", "BH1750FVI"];

type Stage = -1 | 0 | 1 | 2 | 3; // -1 未开始, 0-2 进行中, 3 完成

/* -------------------- 页面 -------------------- */

export default function DatasheetsPage() {
  const [chip, setChip] = useState("");
  const [stage, setStage] = useState<Stage>(-1);
  const [visibleSources, setVisibleSources] = useState(0);
  const [visibleSkills, setVisibleSkills] = useState(0);
  const [saved, setSaved] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const analyzing = stage >= 0 && stage < 3;
  const done = stage === 3;

  const analyze = () => {
    if (!chip.trim() || analyzing) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSaved(false);
    setVisibleSources(0);
    setVisibleSkills(0);
    setStage(0);

    const later = (ms: number, fn: () => void) =>
      timers.current.push(setTimeout(fn, ms));

    // Step 1：逐个检索到资料
    mockSources.forEach((_, i) => later(500 + i * 420, () => setVisibleSources(i + 1)));
    // Step 2：逐个调用 skills
    later(500 + mockSources.length * 420 + 400, () => setStage(1));
    mockSkills.forEach((_, i) =>
      later(500 + mockSources.length * 420 + 800 + i * 700, () => setVisibleSkills(i + 1))
    );
    // Step 3：生成档案
    const genAt = 500 + mockSources.length * 420 + 800 + mockSkills.length * 700 + 400;
    later(genAt, () => setStage(2));
    later(genAt + 1400, () => setStage(3));
  };

  return (
    <div className="p-6 lg:p-8">
      <PageHeader helpKey="datasheets"
        icon={BookOpen}
        title="芯片资料解析"
        description="输入芯片 / 传感器型号，AI 全网检索资料、调用 Skills 分析，生成 AI 可迅速调用的器件档案"
      />

      {/* 型号检索 */}
      <div className="rounded-xl border border-border/80 bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground">芯片 / 传感器型号</label>
          <div className="flex flex-wrap gap-1.5">
            {exampleChips.map((c) => (
              <button
                key={c}
                onClick={() => setChip(c)}
                className="rounded-md border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={chip}
              onChange={(e) => setChip(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="输入型号，如 ESP32-S3、SHT30、TPS63020..."
              className="pl-9"
            />
          </div>
          <Button onClick={analyze} disabled={!chip.trim() || analyzing} className="gap-2">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "分析中..." : "开始分析"}
          </Button>
        </div>
      </div>

      {/* 流水线 */}
      {stage >= 0 && (
        <div className="animate-fade-up mt-6 space-y-4">
          {/* Step 1：全网检索 */}
          <PipelineCard
            index={1}
            icon={Globe}
            title="全网检索"
            state={stage === 0 ? "active" : "done"}
            summary={stage > 0 ? `找到 ${mockSources.length} 份高置信度资料` : undefined}
          >
            <div className="space-y-2">
              {mockSources.slice(0, visibleSources).map((s) => (
                <div
                  key={s.title}
                  className="animate-fade-up flex items-center gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                >
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                    {s.kind}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">{s.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.site}</span>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                </div>
              ))}
              {stage === 0 && (
                <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  正在检索 datasheet、引脚图与开源参考原理图...
                </p>
              )}
            </div>
          </PipelineCard>

          {/* Step 2：AI Skills 分析 */}
          {stage >= 1 && (
            <PipelineCard
              index={2}
              icon={Sparkles}
              title="AI Skills 分析"
              state={stage === 1 ? "active" : "done"}
              summary={stage > 1 ? "3 个训练时嵌入的 Skills 调用完成" : undefined}
            >
              <div className="space-y-2">
                {mockSkills.slice(0, visibleSkills).map((s) => (
                  <div
                    key={s.name}
                    className="animate-fade-up rounded-lg border border-border/60 bg-background/70 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-500">
                        {s.name}
                      </code>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{s.desc}</p>
                    <p className="mt-1 text-xs font-medium text-foreground">{s.output}</p>
                  </div>
                ))}
                {stage === 1 && (
                  <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    正在调用 Skills 理解资料内容...
                  </p>
                )}
              </div>
            </PipelineCard>
          )}

          {/* Step 3：生成器件档案 */}
          {stage >= 2 && (
            <PipelineCard
              index={3}
              icon={FileJson}
              title="生成器件档案"
              state={stage === 2 ? "active" : "done"}
              summary={done ? "chip-profile.json 已生成，AI 可直接调用" : undefined}
            >
              {stage === 2 ? (
                <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  正在规范化参数表、统一信号命名并写入档案...
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* JSON 档案 */}
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2">
                      <span className="font-mono text-xs font-medium text-foreground">
                        esp32-s3-wroom-1.chip-profile.json
                      </span>
                      <button className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                        <Download className="h-3 w-3" />
                        下载
                      </button>
                    </div>
                    <pre className="max-h-80 overflow-auto bg-background/70 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                      {chipProfileJson}
                    </pre>
                  </div>

                  {/* 引脚 + 电气 */}
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-lg border border-border/60">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/60 bg-background/70 text-xs text-muted-foreground">
                            <th className="px-3 py-2 text-left font-medium">引脚</th>
                            <th className="px-3 py-2 text-left font-medium">名称</th>
                            <th className="px-3 py-2 text-left font-medium">说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mockPins.map((p) => (
                            <tr key={p.pin} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 font-mono text-muted-foreground">{p.pin}</td>
                              <td className="px-3 py-2 font-mono font-medium text-foreground">{p.name}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{p.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border/60">
                      <table className="w-full text-sm">
                        <tbody>
                          {mockElectrical.map((e) => (
                            <tr key={e.label} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 text-foreground">{e.label}</td>
                              <td className="px-3 py-2 text-right font-medium text-foreground">
                                {e.typ} {e.unit}
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                                {e.min} ~ {e.max}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </PipelineCard>
          )}

          {/* 完成操作 */}
          {done && (
            <div className="animate-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="flex-1 text-sm text-foreground">
                <span className="font-semibold">{chip || "ESP32-S3-WROOM-1"}</span> 的器件档案已生成，
                原理图生成与方案选型可直接调用
              </p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setSaved(true)}
                disabled={saved}
              >
                <Database className="h-4 w-4" />
                {saved ? "已加入物料库（待审核）" : "加入物料库"}
              </Button>
              <Button variant="ghost" className="gap-2" onClick={analyze}>
                <RotateCcw className="h-4 w-4" />
                重新检索
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 分隔：PDF 上传解析 */}
      <PdfUploadSection />
    </div>
  );
}

/* -------------------- 流水线卡片 -------------------- */

function PipelineCard({
  index,
  icon: Icon,
  title,
  state,
  summary,
  children,
}: {
  index: number;
  icon: typeof Globe;
  title: string;
  state: "active" | "done";
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-fade-up rounded-xl border bg-card p-5 transition-colors",
        state === "active" ? "border-primary/40" : "border-border/80"
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
            state === "done"
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-primary/10 text-primary"
          )}
        >
          {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : index}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        {state === "active" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>
      {children}
    </div>
  );
}

/* -------------------- PDF 上传解析（备选方式） -------------------- */

interface PdfResult {
  chip: string;
  pins: { pin: string; name: string; type: string; desc: string }[];
  package: string;
  constraints: string[];
}

const pdfMockResult: PdfResult = {
  chip: "STM32F103C8T6",
  pins: [
    { pin: "1", name: "VBAT", type: "电源", desc: "后备电池供电" },
    { pin: "21", name: "PB10", type: "I/O", desc: "I2C2_SCL / USART3_TX" },
    { pin: "22", name: "PB11", type: "I/O", desc: "I2C2_SDA / USART3_RX" },
    { pin: "34", name: "PA13", type: "I/O", desc: "SWDIO 调试数据" },
    { pin: "37", name: "PA14", type: "I/O", desc: "SWCLK 调试时钟" },
  ],
  package: "LQFP-48 (7×7mm)",
  constraints: [
    "VBAT 必须接电池或 VDD，不可悬空",
    "所有 VDD/VSS 引脚需 100nF 去耦电容就近放置",
    "BOOT0 下拉到地选择主闪存启动",
    "ADC 输入电压不得超过 VDDA",
  ],
};

function PdfUploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<PdfResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parse = () => {
    if (!file) return;
    setParsing(true);
    setTimeout(() => {
      setResult(pdfMockResult);
      setParsing(false);
    }, 2000);
  };

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border/70" />
        <span className="text-xs font-medium text-muted-foreground">
          已有 Datasheet PDF？直接上传解析
        </span>
        <div className="h-px flex-1 bg-border/70" />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) {
            setFile(f);
            setResult(null);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-card/50 hover:border-primary/40 hover:bg-card"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              setResult(null);
            }
          }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {file ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
        </div>
        {file ? (
          <>
            <p className="mt-3 text-sm font-semibold text-foreground">{file.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm font-semibold text-foreground">
            拖拽 Datasheet PDF 到这里，或点击上传
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={parse} disabled={!file || parsing} className="gap-2">
          {parsing && <Loader2 className="h-4 w-4 animate-spin" />}
          {parsing ? "解析中..." : "开始解析"}
        </Button>
      </div>

      {result && (
        <div className="animate-fade-up mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">识别芯片</p>
              <p className="text-lg font-bold text-foreground">{result.chip}</p>
            </div>
            <span className="rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {result.package}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/80 bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">引脚定义（关键）</h3>
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <tbody>
                    {result.pins.map((p) => (
                      <tr key={p.pin} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{p.pin}</td>
                        <td className="px-3 py-2 font-mono font-medium text-foreground">{p.name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">设计约束与注意事项</h3>
              <ul className="space-y-2">
                {result.constraints.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
