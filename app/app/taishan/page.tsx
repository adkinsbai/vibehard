"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 嵌入式开发平台（VibeBoard）前端挂进来的地址。
//
// 默认是根路径绝对地址 /Vibeboard/，**故意不经过 assetPath() 加 basePath 前缀**：
// VibeBoard 挂在 ldcx.tech 的站点根下，不在本工作台的 /vibehard 子路径里。
// 另外它和工作台同源，所以这是同源 iframe —— next.config.ts 的 CSP 里 frame-src 回退到
// default-src 'self'，同源就够了，不需要为此放宽任何安全头。
// 本地开发时 VibeBoard 通常跑在 8789，构建前设置：
//   NEXT_PUBLIC_TAISHAN_APP_URL=http://127.0.0.1:8789/
const TAISHAN_APP_URL = process.env.NEXT_PUBLIC_TAISHAN_APP_URL || "/Vibeboard/";

// AppNav 是 py-4（上下各 1rem）+ 2rem 高的图标 = 4rem 内容，再加 1px 下边框。
const NAV_HEIGHT = "4.0625rem";

type LoadState = "loading" | "ready" | "stalled";

export default function TaishanPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<LoadState>("loading");

  const reload = useCallback(() => {
    setState("loading");
    setNonce((value) => value + 1);
  }, []);

  // 被 X-Frame-Options / CSP 拒载的 iframe 不会触发 onError，也拿不到任何可读的错误信息，
  // 所以只能用「load 事件 + 超时」把「还在加载」和「打不开」区分开，而不是假装知道原因。
  useEffect(() => {
    if (state !== "loading") return;
    const timer = window.setTimeout(() => setState("stalled"), 15000);
    return () => window.clearTimeout(timer);
  }, [state, nonce]);

  return (
    <div
      className="flex flex-col overflow-hidden p-6 lg:p-8"
      style={{ height: `calc(100dvh - ${NAV_HEIGHT})` }}
    >
      <PageHeader
        helpKey="taishan"
        icon={MonitorSmartphone}
        title="泰山派开发"
        description="在 VibeHard 工作台内打开独立的 VibeBoard 嵌入式开发系统；应用生成、校验与设备部署以该系统的实际结果为准"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </Button>
        <a
          href={TAISHAN_APP_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          在新窗口打开
        </a>
        <span className="text-xs text-muted-foreground">
          VibeBoard 账号体系独立，首次使用需要在框内单独登录；项目和知识数据暂不与 VibeHard 自动同步。
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card/30">
        {state !== "ready" ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            {state === "loading" ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载开发平台…
              </div>
            ) : (
              <div className="max-w-md space-y-3 px-6 text-center">
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  开发平台还没有加载出来
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  开发平台没启动、地址不对，或者浏览器拦了内嵌页面，这里就会一直空着。
                  点「在新窗口打开」可以直接访问 {TAISHAN_APP_URL}。
                </p>
                <Button variant="outline" size="sm" onClick={reload}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  再试一次
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {/* 不加 sandbox：平台需要自己的 localStorage、WebSocket 和 480x360 预览，
            加沙箱会把平台自己的功能一起关掉。同源 iframe 本来就不需要额外隔离。 */}
        <iframe
          key={nonce}
          ref={frameRef}
          src={TAISHAN_APP_URL}
          title="泰山派开发平台"
          className="h-full w-full border-0"
          onLoad={() => setState("ready")}
        />
      </div>
    </div>
  );
}
