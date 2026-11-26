"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Grid2X2, Search, X, List, LayoutGrid, ExternalLink, Plus } from "lucide-react";
import { NOT_LISTED_PRODUCTS, type PanelMeta } from "@/lib/platform/panels/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ProductLogo from "@/components/products/ProductLogo";
import { cn } from "@/lib/utils";

/** Clear, human-friendly short description for each product explaining what it does. */
export const PRODUCT_SHORT_DESCRIPTIONS: Record<string, string> = {
  workspace: "Business OS, Command Center & Workflow Automations",
  hrms: "HRMS, Employee Directory, Attendance, Payroll & Leave",
  pms: "Agile Project Delivery, Kanban Boards, Tasks & Costing",
  lms: "Sales CRM, Lead Pipelines, AI Communications & Calls",
  fms: "Invoicing, Accounting, Payment Links, Ledger & Taxes",
  prms: "Procurement, Purchase Orders, Vendor Bills & Expenses",
  tms: "Training Programs, Batches, Curriculum & LMS Certificates",
  messenger: "Team Chat Channels, Direct Messages, Calls & Meetings",
  sop: "Standard Operating Procedures, Policies & Compliance",
  lpms: "AI Contract Generation, Legal Agreements & e-Signatures",
  dlms: "Zero-Trust Encrypted Credential Vault & Document Locker",
  ots: "Timed Online Skill Assessments & Anti-Cheat Tests",
  aibots: "Custom AI Agents, Trained Bots & Voice Copilots Studio",
  intelligence: "Conversational AI Business Intelligence & Live Analytics",
  smms: "AI Social Media Posts, Viral Campaigns & Content Calendar",
  seo: "Google Rank Tracking, Technical SEO Audits & Backlinks",
  cms: "No-Code Website Builder, CMS Blogs & Lead Capture Forms",
  portal: "Client, Student, Partner & Applicant Self-Service Portal",
  support: "AI Customer Support Desk, Helpdesk Tickets & Knowledgebase",
  website: "Public Company Website, Custom Domain Hosting & SSL",
};

const matches = (product: PanelMeta, q: string) => `${product.name} ${product.shortName} ${PRODUCT_SHORT_DESCRIPTIONS[product.key] || product.description || ""}`.toLocaleLowerCase().includes(q);

/**
 * The product switcher of every top bar. It lists only the products this company can open (what it has not bought is not
 * shown as a dead row; one link leads to adding products).
 */
export default function ProductLauncher({
  currentPanel,
  products: panelList,
}: {
  currentPanel: string;
  products: PanelMeta[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const listed = useMemo(
    () => panelList.filter((p) => !NOT_LISTED_PRODUCTS.has(p.key)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [panelList]
  );
  const mine = useMemo(() => listed.filter((p) => p.available), [listed]);
  const q = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => (q ? mine.filter((p) => matches(p, q)) : mine), [mine, q]);
  // Products the company could still add. Not offered inside the client portal, whose users don't buy anything.
  const canAdd = currentPanel !== "portal" && listed.length > mine.length;
  const close = () => setOpen(false);

  const toggle = (mode: "list" | "grid", label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => setViewMode(mode)}
      title={label}
      aria-label={label}
      aria-pressed={viewMode === mode}
      className={cn("flex size-8 items-center justify-center rounded-lg transition-colors", viewMode === mode ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <SheetTrigger
        render={
          <button
            type="button"
            title="Browse products"
            aria-label="Browse all products"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Grid2X2 className="size-[18px]" />
          </button>
        }
      />
      <SheetContent side="right" className="flex w-[min(30rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b border-border/60 px-5 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            All products
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{mine.length}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">Switch to another product in your workspace.</SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 px-4 py-3">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 text-muted-foreground transition-colors focus-within:border-primary/50 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, e.g. CRM or payroll"
              aria-label="Find a product"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="rounded-md p-1 hover:bg-muted hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/40 p-1">
            {toggle("list", "List view", List)}
            {toggle("grid", "Grid view", LayoutGrid)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center">
              <Search className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">No product of yours matches &ldquo;{query}&rdquo;</p>
              <button type="button" onClick={() => setQuery("")} className="mt-2 text-xs font-semibold text-primary hover:underline">Show all products</button>
            </div>
          ) : (
            <ul className={viewMode === "list" ? "space-y-1.5" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
              {filtered.map((product) => {
                const isCurrent = product.key === currentPanel;
                const name = product.shortName || product.name;
                const description = PRODUCT_SHORT_DESCRIPTIONS[product.key] || product.description || "Workspace product";
                const list = viewMode === "list";
                return (
                  <li key={product.key} className="group relative">
                    <Link
                      href={product.route}
                      onClick={close}
                      aria-current={isCurrent ? "page" : undefined}
                      title={list ? undefined : description}
                      className={cn(
                        "flex h-full rounded-2xl border outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/50",
                        list ? "items-center gap-3 py-2.5 pr-12 pl-2.5" : "flex-col items-center gap-2 px-2 py-3.5 text-center",
                        isCurrent ? "border-primary/40 bg-primary/10" : "border-border/50 bg-card/60 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
                      )}
                    >
                      <ProductLogo productKey={product.key} size={list ? 40 : 44} className="shrink-0 transition-transform group-hover:scale-105" />
                      <span className={cn("min-w-0", list ? "flex-1" : "w-full")}>
                        <span className={cn("flex items-center gap-2", !list && "flex-col gap-1")}>
                          <span className={cn("truncate font-semibold text-foreground", list ? "text-sm" : "w-full text-xs")}>{name}</span>
                          {isCurrent && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Current</span>}
                        </span>
                        {list && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{description}</span>}
                      </span>
                    </Link>
                    {list && (
                      <a
                        href={product.route}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                        aria-label={`Open ${name} in a new tab`}
                        title="Open in a new tab"
                        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canAdd && (
          <div className="border-t border-border/60 p-3">
            <Link href="/commandos/settings/billing" onClick={close} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <Plus className="size-4" aria-hidden /> Add more products
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
