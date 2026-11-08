"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cashflow-ai/income-tax", label: "Tax for the year", exact: true },
  { href: "/cashflow-ai/income-tax/advance-tax", label: "Advance tax & payments" },
  { href: "/cashflow-ai/income-tax/losses", label: "Losses carried forward" },
  { href: "/cashflow-ai/income-tax/returns", label: "Return, audit & notices" },
];

export default function IncomeTaxNav() {
  const pathname = usePathname();
  const fy = useSearchParams().get("fy");
  return (
    <nav aria-label="Income tax" className="flex flex-wrap gap-1.5 border-b border-border/50 pb-2">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
        return (
          <Link key={t.href} href={fy ? `${t.href}?fy=${fy}` : t.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
