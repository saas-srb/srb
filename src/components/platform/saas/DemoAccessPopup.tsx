"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ExternalLink, KeyRound, Sparkles, X } from "lucide-react";
import CopyDemoValue from "@/components/platform/saas/CopyDemoValue";
import { DEMO_ACCESS, buildDemoUrls } from "@/components/platform/saas/demo-access";

const KEY = "sr-demo-access-closed";
const QUIET = ["/signup", "/login", "/register"];
export default function DemoAccessPopup() {
  const path = usePathname() || "/";
  const [visible, setVisible] = useState(false);
  const [urls, setUrls] = useState<{ website: string; workspace: string }>({ website: DEMO_ACCESS.website, workspace: DEMO_ACCESS.workspace });

  useEffect(() => {
    setUrls(buildDemoUrls());
    try {
      if (sessionStorage.getItem(KEY) === "1") return;
    } catch {}
    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible || QUIET.some((route) => path === route || path.startsWith(`${route}/`))) return null;

  function close() {
    setVisible(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
  }

  return (
    <aside
      aria-label="Explore the SelfRun demo"
      className="fixed bottom-4 left-4 z-[55] w-[min(22rem,calc(100vw-5.5rem))] sm:bottom-5 sm:left-5 sm:w-[22rem]"
      style={{ animation: "sr-in .45s ease both" }}
    >
      <div className="sr-band relative rounded-3xl p-5 shadow-xl shadow-primary/20">

        {/* Close */}
        <button
          type="button"
          onClick={close}
          aria-label="Close demo invitation"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/90">
          <Sparkles className="h-3 w-3" />
          Live demo
        </span>

        <h2 className="mt-3 pr-6 text-base font-black leading-snug tracking-tight text-white">
          Explore the full SelfRun workspace
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/70">
          Try the live demo with shared access. Explore products and workflows at your own pace.
        </p>

        {/* Credentials */}
        <div className="mt-4 divide-y divide-white/10 rounded-2xl bg-white/10">
          <Credential label="Email" value={DEMO_ACCESS.email} />
          <Credential label="Password" value={DEMO_ACCESS.password} />
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/50">
          <KeyRound className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
          Shared demo — don't enter personal or payment info.
        </p>

        {/* CTAs */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={urls.workspace}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-black transition-transform hover:scale-[1.02]"
          >
            Explore workspace <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={urls.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
          >
            Visit site <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </aside>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-white/50">{label}</p>
        <code className="mt-0.5 block break-all text-xs font-semibold text-white">{value}</code>
      </div>
      <CopyDemoValue value={value} />
    </div>
  );
}
