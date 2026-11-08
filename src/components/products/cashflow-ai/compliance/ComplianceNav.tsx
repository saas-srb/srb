"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cashflow-ai/compliance", label: "Overview", exact: true },
  { href: "/cashflow-ai/compliance/checklist", label: "CA checklist" },
  { href: "/cashflow-ai/compliance/calendar", label: "Filing calendar" },
  { href: "/cashflow-ai/compliance/cleanup", label: "Books clean-up" },
  { href: "/cashflow-ai/compliance/team", label: "Who does what" },
];

export default function ComplianceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="CA & Compliance" className="flex flex-wrap gap-1.5 border-b border-border/50 pb-2">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
