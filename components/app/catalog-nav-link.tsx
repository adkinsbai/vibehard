"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library } from "lucide-react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import { canReadBoardCatalog } from "@/lib/board-catalog";
import { apiPath, cn } from "@/lib/utils";

export function CatalogNavLink({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setAllowed(false);
      void fetch(apiPath("/api/auth/session"), { cache: "no-store", signal })
        .then(response => response.ok ? response.json() : null)
        .then(session => { if (active && !signal.aborted) setAllowed(Boolean(session?.authenticated && canReadBoardCatalog(session.user?.role))); })
        .catch(() => { if (active && !signal.aborted) setAllowed(false); });
    };
    refresh();
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller?.abort(); window.removeEventListener(AUTH_CHANGED_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [pathname]);
  if (!allowed) return null;
  const selected = pathname === "/app/knowledge" || pathname.startsWith("/app/board-library");
  return <Link href="/app/knowledge" prefetch={false} aria-current={selected ? "page" : undefined} className={cn("items-center gap-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted hover:text-primary", mobile ? "inline-flex px-2 py-2 md:hidden" : "flex px-3 py-2.5", selected ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
    <Library className="size-4 shrink-0" aria-hidden="true" />知识库
  </Link>;
}
