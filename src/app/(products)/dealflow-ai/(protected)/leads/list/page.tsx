import { requireLmsPage } from "@/lib/lms-auth";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listLeadRecords } from "@/lib/lead-management/records";
import { stageMeta } from "@/lib/lead-management/workflows";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import type { LeadType, LeadManagementSource } from "@/lib/lead-management/types";
import { isPortalRole } from "@/lib/portal-roles";
import { formatDateTime } from "@/lib/utils";
import LoginAsPortalUserButton from "./LoginAsPortalUserButton";
import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import { leadCallSpec } from "@/lib/dealflow-ai/call-targets";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<LeadType, string> = {
  job_applicant: "Job Applicant",
  intern: "Intern",
  trainee: "Trainee",
  client: "Client",
};

const TYPE_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "job_applicant", label: "Job Applicants" },
  { key: "intern", label: "Interns" },
  { key: "trainee", label: "Trainees" },
  { key: "client", label: "Clients" },
];

export default async function LeadsListPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; search?: string; source?: string }>;
}) {
  await requireLmsPage("VIEW_LEADS");
  const sp = await searchParams;
  const type = sp.type && isPortalRole(sp.type) ? (sp.type as LeadType) : undefined;
  const status = sp.status === "open" || sp.status === "won" || sp.status === "lost" ? sp.status : undefined;
  const source = sp.source && sp.source in LEAD_SOURCE_META ? (sp.source as LeadManagementSource) : undefined;
  const search = sp.search?.trim() || undefined;

  const leads = await listLeadRecords({ type, status, source, search, limit: 300 });

  function tabHref(key: string) {
    const params = new URLSearchParams();
    if (key) params.set("type", key);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const q = params.toString();
    return `/dealflow-ai/leads/list${q ? `?${q}` : ""}`;
  }

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Lead Management", href: "/dealflow-ai/leads" }, { label: "All leads" }]}
        title={<>All leads</>}
        actions={<><Link href="/dealflow-ai/leads/new" className={buttonVariants({ size: "sm" })}>
          New lead
        </Link></>}
      />

      <PanelListFilters>
<div className="flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={
              (type ?? "") === t.key
                ? buttonVariants({ size: "sm" })
                : buttonVariants({ variant: "outline", size: "sm" })
            }
          >
            {t.label}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/dealflow-ai/leads/list">
          {type && <input type="hidden" name="type" value={type} />}
          <input
            name="search"
            defaultValue={search}
            placeholder="Search name, email, code…"
            className="h-8 w-56 rounded-xl border border-border/50 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </form>
      </div>

      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Lead</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Stage</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/dealflow-ai/leads/${l._id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {l.name}
                    </Link>
                    {l.hasUnreadPortalReply && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <span className="size-1.5 rounded-full bg-primary" /> New reply
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">{l.code} · {l.email} · {l.phone}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{TYPE_LABEL[l.type]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{LEAD_SOURCE_META[l.source].label}</td>
                  <td className="py-2 pr-3 text-foreground">{stageMeta(l.type, l.stage)?.label ?? l.stage}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        l.status === "won"
                          ? "rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400"
                          : l.status === "lost"
                            ? "rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive"
                            : "rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground"
                      }
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(l.createdAt)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                    <DealflowCallButton spec={leadCallSpec(l)} compact />
                    <LoginAsPortalUserButton
                      externalUserId={l.externalUserId}
                      leadId={l._id}
                      displayName={l.name}
                      variant="icon"
                    />
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">No leads match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
