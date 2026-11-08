"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cashflow-ai/gst", label: "Monthly summary (GSTR-3B)", exact: true },
  { href: "/cashflow-ai/gst/sales", label: "Sales (GSTR-1)" },
  { href: "/cashflow-ai/gst/purchases", label: "Purchases & input credit" },
  { href: "/cashflow-ai/gst/reconcile", label: "Match with GSTR-2B" },
];

export default function GstNav() {
  const pathname = usePathname();
  const month = useSearchParams().get("month");
  return (
    <nav aria-label="GST" className="flex flex-wrap gap-1.5 border-b border-border/50 pb-2">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
        return (
          <Link key={t.href} href={month ? `${t.href}?month=${month}` : t.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
