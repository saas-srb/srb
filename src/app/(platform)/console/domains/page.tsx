import type { Metadata } from "next";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listAllDomains, type DomainKindFilter, type DomainSslFilter, type DomainStatusFilter } from "@/lib/platform/domains/overview";
import DomainsFilterBar from "./DomainsFilterBar";
import DomainsGrid from "./DomainsGrid";

export const metadata: Metadata = { title: "Domains & SSL" };

type SP = { q?: string; kind?: string; status?: string; ssl?: string; issues?: string; page?: string };

export default async function PlatformDomainsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePlatformPermission("domains.read");
  const sp = await searchParams;
  const kind = (["subdomain", "custom"].includes(sp.kind ?? "") ? sp.kind : "all") as DomainKindFilter;
  const status = (["verified", "pending"].includes(sp.status ?? "") ? sp.status : "all") as DomainStatusFilter;
  const ssl = (["active", "pending", "error", "manual"].includes(sp.ssl ?? "") ? sp.ssl : "all") as DomainSslFilter;
  const issues = sp.issues === "1";
  const list = await listAllDomains({ q: sp.q, kind, status, ssl, issues, page: Number(sp.page) || 1 });
  const s = list.summary;

  const stats = [
    { label: "Domains", value: s.total },
    { label: "Custom domains", value: s.custom },
    { label: "Pending verification", value: s.pending },
    { label: "SSL active", value: s.sslActive },
    { label: "SSL errors", value: s.errors },
  ];

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Domains & SSL" description="Every company's addresses — automatic subdomains and custom domains — with DNS, SSL and hosting status." crumbs={[{ label: "Tenants" }]} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((x) => (
          <GlassCard key={x.label} interactive={false}>
            <CardContent className="py-4">
              <p className="text-xs font-medium text-muted-foreground">{x.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{x.value}</p>
            </CardContent>
          </GlassCard>
        ))}
      </div>
      <DomainsGrid
        rows={list.rows}
        total={list.total}
        page={list.page}
        totalPages={list.totalPages}
        hasActiveFilters={Boolean(sp.q || kind !== "all" || status !== "all" || ssl !== "all" || issues)}
        filters={<DomainsFilterBar initial={{ q: sp.q ?? "", kind, status, ssl, issues: issues ? "1" : "all" }} />}
      />
    </div>
  );
}
