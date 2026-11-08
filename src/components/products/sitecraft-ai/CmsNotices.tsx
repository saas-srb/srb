"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Construction } from "lucide-react";

/**
 * Product-wide admin notices (WordPress-style) shown above every CMS screen,
 * plus the `cms_ui` hint cookie for sessions that started before it existed
 * (see CMS_UI_HINT_COOKIE) so the website's admin toolbar appears for them too.
 */
export default function CmsNotices({ maintenance }: { maintenance: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!document.cookie.split("; ").includes("cms_ui=1")) {
      document.cookie = `cms_ui=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    }
  }, []);

  if (!maintenance || pathname === "/sitecraft-ai/settings") return null;
  return (
    <div className="px-4 pt-4 sm:px-6">
      <Link
        href="/sitecraft-ai/settings"
        className="mx-auto flex max-w-7xl items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-amber-500/15"
      >
        <Construction className="size-5 shrink-0 text-amber-600" />
        <span>
          <strong>Maintenance mode is on</strong> — public visitors currently see the maintenance page. Turn it off in Settings.
        </span>
        <ArrowRight className="ml-auto size-4 shrink-0" />
      </Link>
    </div>
  );
}
