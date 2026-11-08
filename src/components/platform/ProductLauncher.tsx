"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Grid2X2, Search, X, List, LayoutGrid, ChevronRight } from "lucide-react";
import type { PanelMeta } from "@/lib/platform/panels/types";
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

  const products = useMemo(
    () => [...panelList].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [panelList]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q
      ? products.filter((product) => {
          const desc = PRODUCT_SHORT_DESCRIPTIONS[product.key] || product.description || "";
          return `${product.name} ${product.shortName} ${desc}`.toLocaleLowerCase().includes(q);
        })
      : products;
  }, [products, query]);

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
      <SheetContent
        side="right"
        className="w-[min(30rem,calc(100vw-1rem))] gap-0 overflow-hidden border-border/70 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4 pr-14">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="text-base font-semibold">All products</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">
                Switch to another product in your workspace.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Search bar + View Mode Toggle */}
        <div className="flex items-center gap-2 border-b border-border/50 p-3">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-muted-foreground focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find product (e.g. CRM, Payroll, SEO...)"
              aria-label="Find a product"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="rounded p-0.5 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>

          <div className="flex items-center rounded-xl border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view with descriptions"
              className={cn(
                "flex size-7 items-center justify-center rounded-lg transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={cn(
                "flex size-7 items-center justify-center rounded-lg transition-colors",
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>

        {/* Product Listing */}
        {viewMode === "list" ? (
          /* ─── List View (Full row with Logo, Name & Short Description) ─── */
          <div className="flex-1 divide-y divide-border/30 overflow-y-auto p-2">
            {filtered.map((product) => {
              const isCurrent = product.key === currentPanel;
              const shortDesc =
                PRODUCT_SHORT_DESCRIPTIONS[product.key] || product.description || "Workspace product";

              const content = (
                <>
                  <span className="relative flex size-11 shrink-0 items-center justify-center transition-transform group-hover:scale-105">
                    <ProductLogo productKey={product.key} size={42} className="drop-shadow-sm" />
                    {isCurrent && (
                      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        {product.shortName || product.name}
                      </span>
                      {isCurrent ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Current
                        </span>
                      ) : !product.available ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Unavailable
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 leading-normal">
                      {shortDesc}
                    </p>
                  </div>
                </>
              );

              const className = cn(
                "group flex items-center rounded-xl transition-all text-left",
                isCurrent ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60",
                !product.available ? "cursor-not-allowed opacity-45" : "cursor-pointer"
              );

              return product.available ? (
                <div key={product.key} className={className}>
                  <Link
                    href={product.route}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${product.name} (opens in a new tab)`}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                  <Link
                    href={product.route}
                    aria-label={`Open ${product.name} in this tab`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => setOpen(false)}
                  >
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </div>
              ) : (
                <div
                  key={product.key}
                  aria-label={`${product.name} is unavailable`}
                  aria-disabled="true"
                  className={className}
                >
                  {content}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No products match &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
        ) : (
          /* ─── Grid View (Cards with Logo, Name & 2-line Description) ─── */
          <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3">
            {filtered.map((product) => {
              const isCurrent = product.key === currentPanel;
              const shortDesc =
                PRODUCT_SHORT_DESCRIPTIONS[product.key] || product.description || "Workspace product";

              const content = (
                <>
                  <span className="relative mb-2 flex size-12 items-center justify-center transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-105">
                    <ProductLogo productKey={product.key} size={46} className="drop-shadow-md" />
                    {isCurrent && (
                      <span className="absolute top-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                    )}
                  </span>
                  <span className="w-full truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                    {product.shortName || product.name}
                  </span>
                  {isCurrent ? (
                    <span className="mt-0.5 text-[9px] font-semibold text-primary">Current</span>
                  ) : !product.available ? (
                    <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">Unavailable</span>
                  ) : null}
                  <p className="mt-1 w-full text-[10px] leading-tight text-muted-foreground line-clamp-2">
                    {shortDesc}
                  </p>
                </>
              );

              const className = cn(
                "group relative flex flex-col items-center justify-start rounded-2xl border p-3 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isCurrent
                  ? "border-primary/40 bg-primary/5 shadow-xs"
                  : "border-border/60 bg-card hover:border-primary/30 hover:bg-muted/50 hover:shadow-xs",
                !product.available ? "cursor-not-allowed opacity-45" : "cursor-pointer"
              );

              return product.available ? (
                <Link
                  key={product.key}
                  href={product.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={product.name}
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={product.key}
                  aria-label={`${product.name} is unavailable`}
                  aria-disabled="true"
                  className={className}
                >
                  {content}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p className="col-span-2 py-12 text-center text-sm text-muted-foreground">
                No products match &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
