"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/commandos/settings/products/agentos/phone", label: "Phone numbers", exact: true },
  { href: "/commandos/settings/products/agentos/phone/settings", label: "Call settings", exact: false },
  { href: "/commandos/settings/products/agentos/phone/do-not-call", label: "Do not call", exact: false },
] as const;

/** The three pages of the Phone area, as tabs. */
export default function PhoneNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Phone" className="flex flex-wrap gap-1 rounded-2xl border border-border/50 bg-muted/30 p-1">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("rounded-xl px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
