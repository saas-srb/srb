import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, AtSign, Globe, Link2, Lock, Network, ShieldCheck, TriangleAlert } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { checkPlatformPermission, requirePlatformPermission } from "@/lib/platform/console/access";
import { listAllDomains, type DomainKindFilter, type DomainSslFilter, type DomainStatusFilter } from "@/lib/platform/domains/overview";
import DomainsFilterBar from "./DomainsFilterBar";
import DomainsGrid from "./DomainsGrid";
import DomainSyncPanel from "./DomainSyncPanel";
import { DISABLED_NOTE, disabledHosts } from "@/lib/platform/setup/blocked";
import PlatformHostsPanel from "./PlatformHostsPanel";
import { getDomainSyncOverview, getPlatformHostsOverview, summarizeHosts } from "@/lib/platform/domains/sync/run";

export const metadata: Metadata = { title: "Domains & SSL" };

type SP = { q?: string; kind?: string; status?: string; ssl?: string; issues?: string; page?: string };

export default async function PlatformDomainsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePlatformPermission("domains.read");
  const canManage = (await checkPlatformPermission("domains.manage")).ok;
  const sp = await searchParams;
  const kind = (["subdomain", "custom"].includes(sp.kind ?? "") ? sp.kind : "all") as DomainKindFilter;
  const status = (["verified", "pending"].includes(sp.status ?? "") ? sp.status : "all") as DomainStatusFilter;
  const ssl = (["active", "pending", "error", "manual"].includes(sp.ssl ?? "") ? sp.ssl : "all") as DomainSslFilter;
  const issues = sp.issues === "1";
  const list = await listAllDomains({ q: sp.q, kind, status, ssl, issues, page: Number(sp.page) || 1 });
  const s = list.summary;

  const [{ summary: h, problems }, overview, platformHosts] = await Promise.all([summarizeHosts(300), getDomainSyncOverview(), getPlatformHostsOverview()]);
  const blockedHosts = await disabledHosts(problems.map((p) => p.host)).catch(() => [] as string[]);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Domains & SSL" description="Every company's addresses — automatic subdomains and custom domains — with DNS, SSL and hosting status." crumbs={[{ label: "Tenants" }]} />
      {h.ownedElsewhere > 0 && !overview.previousConfigured && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="min-w-0 flex-1">
            <b>{h.ownedElsewhere} address{h.ownedElsewhere === 1 ? " is" : "es are"} still on another Vercel project.</b> Save the previous Vercel project&apos;s API token once (Integrations → Domains &amp; hosting → Previous Vercel project) and Sync will move all of them automatically. After saving, use &quot;Test connection&quot; there to check it reaches the project.
          </p>
          <Link href="/console/integrations#previous-project" className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Open the previous project form</Link>
        </div>
      )}
      {blockedHosts.length > 0 && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{DISABLED_NOTE} Affected: {blockedHosts.join(", ")}.</p>}
      <KpiGrid cols={4}>
        <KpiCard label="Total hosts" value={h.totalHosts} icon={<Globe className="size-4" />} />
        <KpiCard label="Attached" value={h.attached} icon={<Link2 className="size-4" />} />
        <KpiCard label="Verified" value={h.verified} icon={<ShieldCheck className="size-4" />} />
        <KpiCard label="SSL active" value={h.sslActive} icon={<Lock className="size-4" />} />
        <KpiCard label="Needs DNS" value={h.needsDns} icon={<Network className="size-4" />} />
        <KpiCard label="Owned elsewhere" value={h.ownedElsewhere} icon={<ArrowRightLeft className="size-4" />} />
        <KpiCard label="Failed" value={h.failed} icon={<TriangleAlert className="size-4" />} />
        <KpiCard label="Custom domains" value={s.custom} icon={<AtSign className="size-4" />} />
      </KpiGrid>
      <PlatformHostsPanel data={platformHosts} canManage={canManage} />
      {canManage && <DomainSyncPanel initial={overview} problems={problems} />}
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
