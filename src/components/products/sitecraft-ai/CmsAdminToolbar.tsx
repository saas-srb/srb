"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Pencil, Paintbrush, Plus, X, FileText, Newspaper, ChevronUp, Circle } from "lucide-react";
import type { AdminBarData } from "@/app/(products)/api/sitecraft-ai/admin-bar/route";

const HIDDEN_KEY = "cms-admin-toolbar-hidden";

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * WordPress-style admin toolbar on the public site, for signed-in CMS users
 * only: jump to the dashboard, edit the page you're looking at, customize the
 * theme, or create content. Visitors never trigger its request — it only asks
 * the server when the readable `cms_ui` hint cookie (set at CMS sign-in) exists.
 */
export default function CmsAdminToolbar() {
  const pathname = usePathname();
  const [data, setData] = useState<AdminBarData | null>(null);
  const [hidden, setHidden] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Not inside the theme customizer's preview frame, and only for browsers with a CMS sign-in.
    if (window.parent !== window || !document.cookie.split("; ").includes("cms_ui=1")) return;
    let cancelled = false;
    fetch(`/api/sitecraft-ai/admin-bar?path=${encodeURIComponent(pathname)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          document.cookie = "cms_ui=; Max-Age=0; path=/";
          return null;
        }
        return res.ok ? ((await res.json()) as AdminBarData) : null;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setHidden(readHidden());
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!newOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setNewOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [newOpen]);

  if (!data) return null;

  const setHide = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
    } catch {}
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHide(false)}
        aria-label="Show CMS toolbar"
        title="Show CMS toolbar"
        className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur hover:bg-neutral-900"
      >
        <ChevronUp className="size-3.5" /> CMS
      </button>
    );
  }

  const item = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/10 hover:text-white";
  const pageEdit = data.page && data.can.editPages ? `/sitecraft-ai/pages/${data.page.id}` : null;
  const recordEdit = data.record ? `/sitecraft-ai/collections/${data.record.collection}/${data.record.slug}` : null;

  return (
    <div
      role="toolbar"
      aria-label="CMS toolbar"
      className="fixed bottom-4 left-1/2 z-[90] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-neutral-900/95 p-1 font-sans text-white shadow-2xl backdrop-blur-md [scrollbar-width:none]"
    >
      <Link href="/sitecraft-ai" className={item} title={`Signed in as ${data.email} (${data.role})`}>
        <LayoutDashboard className="size-3.5" /> <span className="hidden sm:inline">Dashboard</span>
      </Link>
      {recordEdit && (
        <Link href={recordEdit} className={item}>
          <Pencil className="size-3.5" /> Edit {data.record!.label.toLowerCase()}
        </Link>
      )}
      {pageEdit && (
        <Link href={pageEdit} className={item} title={data.page!.title}>
          <Pencil className="size-3.5" /> Edit page
          {data.page!.pending && <Circle className="size-2 fill-amber-400 text-amber-400" aria-label="Has unpublished changes" />}
        </Link>
      )}
      {data.can.customize && (
        <Link href={`/sitecraft-ai/customize/${data.theme.key}?path=${encodeURIComponent(pathname)}`} className={item} title={`Active theme: ${data.theme.name}`}>
          <Paintbrush className="size-3.5" /> Customize
        </Link>
      )}
      <div ref={menuRef} className="relative">
        <button type="button" className={item} aria-expanded={newOpen} aria-haspopup="menu" onClick={() => setNewOpen((o) => !o)}>
          <Plus className="size-3.5" /> New
        </button>
        {newOpen && (
          <div role="menu" className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl">
            {data.can.createPages && (
              <Link role="menuitem" href="/sitecraft-ai/pages?new=1" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-neutral-200 hover:bg-white/10 hover:text-white">
                <FileText className="size-3.5" /> Page
              </Link>
            )}
            <Link role="menuitem" href="/sitecraft-ai/collections/blog?new=1" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-neutral-200 hover:bg-white/10 hover:text-white">
              <Newspaper className="size-3.5" /> Blog post
            </Link>
          </div>
        )}
      </div>
      <span className="mx-1 hidden h-4 w-px bg-white/15 md:block" />
      <span className="hidden px-2 text-[11px] text-neutral-400 md:inline">Theme: {data.theme.name}</span>
      <button type="button" onClick={() => setHide(true)} aria-label="Hide CMS toolbar" title="Hide toolbar" className="rounded-full p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
