"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cashflow-ai/tds", label: "Deductions & deposits", exact: true },
  { href: "/cashflow-ai/tds/challans", label: "Challans (deposits)" },
  { href: "/cashflow-ai/tds/statement", label: "Quarterly statement (26Q)" },
  { href: "/cashflow-ai/tds/certificates", label: "Certificates" },
  { href: "/cashflow-ai/tds/credits", label: "TDS deducted by customers (26AS)" },
  { href: "/cashflow-ai/tds/settings", label: "Sections & rates" },
];

export default function TdsNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const fy = params.get("fy");
  return (
    <nav aria-label="TDS" className="flex flex-wrap gap-1.5 border-b border-border/50 pb-2">
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
