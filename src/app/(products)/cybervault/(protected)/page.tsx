import Link from "next/link";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import { Building2, Users, KeyRound, FileText, Link2, CalendarClock, TriangleAlert } from "lucide-react";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import { PageHeader, SectionCard, Notice } from "@/components/products/cybervault/DlmsUi";
import PanelFilterBar, { type PanelFilterField as FilterField } from "@/components/platform/panel/PanelFilterBar";
import FeedList from "@/components/products/cybervault/FeedList";
import { getViewer, can } from "@/lib/products/cybervault/viewer";
import { getDashboard, type OverviewFilters } from "@/lib/products/cybervault/overview";
import { AUDIT_ACTION_LABEL } from "@/lib/products/cybervault/audit";
import { CATEGORY_OPTIONS, EXPIRY_FILTERS, RECORD_TYPES, RECORD_TYPE_LABEL, type RecordType } from "@/lib/products/cybervault/constants";
import { SCOPE_OPTIONS, STATUS_OPTIONS, visibleClientOptions, type SearchParams } from "@/lib/products/cybervault/page";
import { getSettings } from "@/lib/products/cybervault/settings";
import { formatDateTime } from "@/lib/utils";

export default async function DlmsDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  const type = (RECORD_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as RecordType) : undefined;
  const filters: OverviewFilters = {
    scope: sp.scope === "company" || sp.scope === "client" ? sp.scope : undefined,
    clientId: sp.client || undefined,
    type,
    category: type && CATEGORY_OPTIONS[type].some((c) => c.value === sp.category) ? sp.category : undefined,
    expiry: EXPIRY_FILTERS.some((e) => e.value === sp.expiry) ? sp.expiry : undefined,
    status: sp.status === "archived" || sp.status === "all" ? sp.status : undefined,
  };
  const [d, clients, settings] = await Promise.all([getDashboard(viewer, filters), visibleClientOptions(viewer), getSettings()]);
  const t = d.totals;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "type" && e[0] !== "category")).toString();
  const withQ = (path: string) => `${path}${q ? `?${q}` : ""}`;

  const fields: FilterField[] = [
    { key: "scope", label: "Ownership", type: "select", options: SCOPE_OPTIONS, allLabel: "Company & clients" },
    { key: "client", label: "Client", type: "select", options: clients, allLabel: "All clients" },
    { key: "type", label: "Record type", type: "select", options: RECORD_TYPES.map((r) => ({ value: r, label: RECORD_TYPE_LABEL[r] })), allLabel: "All types" },
    ...(type ? [{ key: "category", label: "Category", type: "select" as const, options: CATEGORY_OPTIONS[type], allLabel: "All categories" }] : []),
    { key: "expiry", label: "Expiry", type: "select", options: EXPIRY_FILTERS, allLabel: "Any" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, allLabel: "Active" },
  ];

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        title="CyberVault Overview" breadcrumbs={[{ label: "CyberVault", href: "/cybervault" }, { label: "Dashboard" }]} description="Securely manage company and client credentials, documents, links and notes, and stay ahead of expiring records and access changes."
        filters={<PanelFilterBar fields={fields} />}
      />

      {viewer.seesAll ? null : (
        <Notice tone="info">
          You are seeing the records of {viewer.clientIds.length} assigned client{viewer.clientIds.length === 1 ? "" : "s"}
          {viewer.companyAccess ? " and the company vault" : ""}. A manager can change this under Settings.
        </Notice>
      )}

      {d.expiredCount > 0 && (
        <Link href={withQ("/cybervault/expiry")} className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm transition-colors hover:bg-rose-500/15">
          <TriangleAlert className="size-5 shrink-0 text-rose-600" />
          <span className="text-rose-900 dark:text-rose-200">
            <strong>{d.expiredCount} item{d.expiredCount === 1 ? " has" : "s have"} expired</strong>
            {d.expiringCount > 0 && ` and ${d.expiringCount} more expire within ${settings.warnDays} days`} — review them under Expiry &amp; Alerts.
          </span>
        </Link>
      )}

      <KpiGrid>
        <KpiLink href="/cybervault/company" label="Company Records" value={t.company} accent icon={<Building2 className="size-4" />} />
        <KpiLink href="/cybervault/clients" label="Client Records" value={t.client} icon={<Users className="size-4" />} />
        <KpiLink href={withQ("/cybervault/credentials")} label="Credentials" value={t.credentials} icon={<KeyRound className="size-4" />} />
        <KpiLink href={withQ("/cybervault/documents")} label="Documents" value={t.documents} icon={<FileText className="size-4" />} />
        <KpiLink href={withQ("/cybervault/urls")} label="URLs / Accounts" value={t.links} icon={<Link2 className="size-4" />} />
        <KpiLink href={withQ("/cybervault/expiry")} label="Expired / Expiring" value={`${d.expiredCount} / ${d.expiringCount}`} icon={<CalendarClock className="size-4" />} tone={d.expiredCount > 0 ? "down" : undefined} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Expiring credentials & documents" description={`Expired, or within ${settings.warnDays} days`} action={<Link href={withQ("/cybervault/expiry")} className="text-xs text-primary hover:underline">View all</Link>}>
          <FeedList items={d.expiring} show="expiry" empty="Nothing is expired or expiring soon." />
        </SectionCard>
        <SectionCard title="Recent activity" description={d.activityIsOwn ? "Your own actions" : "Latest actions across the vault"} action={can(viewer, "VIEW_AUDIT") ? <Link href="/commandos/settings/audit-log?source=products&module=dlms" className="text-xs text-primary hover:underline">View log</Link> : undefined}>
          {d.activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {d.activity.map((a) => (
                <li key={a._id} className="py-2">
                  <p className="text-sm">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span> · {a.entityLabel ?? a.entity}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{a.actorEmail ?? "system"} · {formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Recently added">
          <FeedList items={d.recentAdded} show="created" empty="Nothing has been added yet." />
        </SectionCard>
        <SectionCard title="Recently updated">
          <FeedList items={d.recentUpdated} show="updated" empty="Nothing has been updated yet." />
        </SectionCard>
      </div>
    </div>
  );
}
