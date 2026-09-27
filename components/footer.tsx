import Image from "next/image";
import Link from "next/link";
import { assetPath } from "@/lib/utils";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border/70 px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 lg:flex-row">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <div className="flex items-center gap-2.5">
            <Image
              src={assetPath("/vibehard-icon.svg")}
              alt=""
              width={28}
              height={28}
              aria-hidden="true"
              className="block shrink-0 select-none h-7 w-7 rounded-md text-primary"
              draggable="false"
              unoptimized
            />
            <span className="text-[13px] font-medium text-muted-foreground">
              © 2026 VibeHard AI Platform
            </span>
          </div>
          <span className="rounded-md text-[13px] font-medium text-muted-foreground">
            AI 辅助研发 · 工程师主导决策
          </span>
        </div>

        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="rounded-md text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            登录
          </Link>
          <a
            href="#access"
            className="rounded-md text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            即将开放注册
          </a>
        </div>
      </div>
    </footer>
  );
}
