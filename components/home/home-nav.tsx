"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import { apiPath, assetPath } from "@/lib/utils";

function useIsLoggedIn() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fetch(apiPath("/api/auth/session"), { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ authenticated: boolean }> : { authenticated: false })
        .then((session) => { if (active) setIsLoggedIn(session.authenticated); })
        .catch(() => { if (active) setIsLoggedIn(false); });
    };
    refresh();
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return isLoggedIn;
}

export function HomeNav() {
  const isLoggedIn = useIsLoggedIn();

  return (
    <nav aria-label="官网导航" className="sticky top-0 z-30 flex items-center justify-between gap-2 whitespace-nowrap border-b border-border/70 bg-background/80 px-3 py-4 backdrop-blur-xl sm:px-4 lg:px-12">
      <div className="flex items-center gap-2.5">
        <Image
          src={assetPath("/vibehard-icon.svg")}
          alt=""
          width={32}
          height={32}
          aria-hidden="true"
          className="block shrink-0 select-none auth-glow h-8 w-8 rounded-lg"
          draggable="false"
          unoptimized
        />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          VibeHard
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <a href="#capabilities" className="hidden px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground md:inline-flex">平台功能</a>
        <a href="#workflow" className="hidden px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground lg:inline-flex">协作流程</a>
        <ThemeToggle />
        <Link
          href="/demo"
          className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground sm:inline-flex"
        >
          流程演示
        </Link>
        {isLoggedIn ? (
          <Link
            href="/app"
            className="rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 active:scale-[0.97] sm:px-4"
          >
            进入工作台
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg px-2 py-2 text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground sm:px-4"
            >
              登录
            </Link>
            <a
              href="#access"
              className="rounded-lg bg-primary px-2 py-2 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 active:scale-[0.97] sm:px-4 sm:text-base"
            >
              即将开放
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
