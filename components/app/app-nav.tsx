"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Settings, Loader2, Terminal } from "lucide-react";
import { logout } from "@/lib/auth";
import { assetPath } from "@/lib/utils";
import { CatalogNavLink } from "@/components/app/catalog-nav-link";

export function AppNav() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/80 px-5 py-4 backdrop-blur-xl lg:px-12">
      <div className="flex items-center gap-2.5">
        <Image
          src={assetPath("/vibehard-icon.svg")}
          alt=""
          width={32}
          height={32}
          aria-hidden="true"
          className="block shrink-0 select-none h-8 w-8 rounded-lg"
          draggable="false"
          unoptimized
        />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          VibeHard
        </span>
        <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary sm:inline-block">
          工作台
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/app/taishan"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          title="泰山派开发"
        >
          <Terminal className="h-4 w-4" />
          <span className="hidden min-[390px]:inline">泰山派</span>
        </Link>
        <CatalogNavLink mobile />
        <Button variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex" title="通知">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex" title="设置">
          <Settings className="h-4 w-4" />
        </Button>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          退出
        </button>
      </div>
    </nav>
  );
}
