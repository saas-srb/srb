import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { formatDate, formatDateTime } from "@/lib/utils";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getCompanyDetail } from "@/lib/platform/console/companies";
import { companyAppBaseUrl, companyBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { saasAppOrigin } from "@/lib/platform/saas/hosts";
import { requestOrigin } from "@/lib/platform/request";
import StatusBadge from "../StatusBadge";
import StatusControl from "./StatusControl";
import DeleteCompanyControl from "./DeleteCompanyControl";
import CompanyAddonsCard from "./CompanyAddonsCard";
import { getCompanyAddons, listAddons } from "@/lib/platform/billing/addons";
import { describeAddonEffect } from "@/lib/platform/billing/catalog-types";
import Link from "next/link";
import { listDomainsForCompany } from "@/lib/platform/domains/overview";
import DomainActions from "../../domains/DomainActions";
import { DnsBadge, SslBadge } from "../../domains/DomainBadges";
import TrialCard from "./TrialCard";
import CompanyPanelsCard from "./CompanyPanelsCard";
import { disabledPanelKeys, listPanels } from "@/lib/platform/panels/store";
import { getTrialOverview } from "@/lib/platform/billing/trials";
import { getCompanyMaintenance } from "@/lib/platform/maintenance-state";
import MaintenanceForm from "../../maintenance/MaintenanceForm";
import ReactivationCard from "./ReactivationCard";
import { listRequests } from "@/lib/platform/reactivation";
import FreeAccessCard from "./FreeAccessCard";
import CompanyOverridesCard from "./CompanyOverridesCard";
import { getOverridesDetail } from "@/lib/platform/billing/overrides-admin";
import LoginAsCompanyButton from "../LoginAsCompanyButton";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";

export const metadata: Metadata = { title: "Company" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default async function ConsoleCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformPermission("companies.read");
  const company = await getCompanyDetail((await params).id);
  if (!company) notFound();
  const domains = await listDomainsForCompany(company.id);
  const { host } = await requestOrigin();
  const base = companyBaseUrl(company.slug, host);
  const appBase = company.isPlatformOwner ? saasAppOrigin(host) : companyAppBaseUrl(company.slug, host);
  const { onboarding: ob } = company;
  const [allAddons, heldAddons] = company.isPlatformOwner ? [[], []] : await Promise.all([listAddons(), getCompanyAddons(company.id)]);
  const trial = company.isPlatformOwner ? null : await getTrialOverview(company.id);
  const reactivations = company.isPlatformOwner ? [] : await listRequests(company.id).catch(() => []);
  const [registry, disabledHere] = await Promise.all([listPanels(), disabledPanelKeys(company.id)]);
  const maintenance = company.isPlatformOwner ? null : await getCompanyMaintenance(company.id);
  const subscription = company.isPlatformOwner ? null : await getCompanySubscription(company.id);
  const overrides = company.isPlatformOwner ? null : await getOverridesDetail(company.id);

  return (
    <div className="space-y-4 p-1">
        <PanelPageHeader
          breadcrumbs={[{ label: "Platform", href: "/console" }, { label: "Companies", href: "/console/companies" }, { label: company.name }]}
          title={<>{company.name}</>}
          description={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={base} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                {base.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" />
              </a>
              <a href={appBase} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Products: {appBase.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" />
              </a>
              <StatusBadge status={company.status} isPlatformOwner={company.isPlatformOwner} />
            </span>
          }
          actions={
            company.isPlatformOwner ? (
              <p className="max-w-56 text-xs text-muted-foreground">The platform owner company runs the platform and can&apos;t be suspended.</p>
            ) : !can(user, "companies.status") && !can(user, "companies.impersonate") ? null : (
              <div className="flex flex-wrap items-start gap-2">
                {company.status === "active" && can(user, "companies.impersonate") && <LoginAsCompanyButton companyId={company.id} companyName={company.name} variant="default" />}
                {can(user, "companies.status") && <StatusControl companyId={company.id} companyName={company.name} status={company.status} />}
                {user.platform.permissions.includes("*") && <DeleteCompanyControl companyId={company.id} companyName={company.name} />}
              </div>
            )
          }
        />

        <ReactivationCard companyId={company.id} companyName={company.name} requests={reactivations} canDecide={can(user, "companies.status")} />

        <GlassCard interactive={false}>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Owner">
                {company.ownerEmail ?? "—"}
                {company.ownerEmail && !company.isPlatformOwner && (
                  <Badge variant={company.ownerEmailVerified ? "secondary" : "outline"} className="ml-2 align-middle" id="owner-email-status">
                    {company.ownerEmailVerified ? "Email verified" : "Email not verified"}
                  </Badge>
                )}
              </Field>
              <Field label="Users">{company.userCount}</Field>
              <Field label="Last sign-in">{company.lastSignInAt ? formatDateTime(company.lastSignInAt) : "Never"}</Field>
              <Field label="Created">{formatDate(company.createdAt)}</Field>
              <Field label="Industry">{company.profile?.industry ?? "—"}</Field>
              <Field label="Country · currency">{company.profile ? `${company.profile.country} · ${company.profile.currency}` : "—"}</Field>
              {company.statusChangedAt && <Field label={company.status === "suspended" ? "Suspended on" : "Status changed"}>{formatDateTime(company.statusChangedAt)}</Field>}
            </dl>
          </CardContent>
        </GlassCard>

        {trial && (
          <TrialCard
            companyId={company.id}
            data={{
              planId: trial.planId,
              planName: trial.planName,
              status: trial.status,
              trialEndsAt: trial.trialEndsAt?.toISOString() ?? null,
              graceEndsAt: trial.graceEndsAt?.toISOString() ?? null,
              daysLeft: trial.daysLeft,
              canExtend: trial.canExtend,
            }}
          />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard interactive={false}>
            <CardHeader>
              <CardTitle className="text-base">Setup progress</CardTitle>
              <CardDescription>
                {company.isPlatformOwner
                  ? "The platform owner doesn't go through onboarding."
                  : ob.completedAt
                    ? `Finished ${formatDate(ob.completedAt)}.`
                    : ob.dismissedAt
                      ? `${ob.done} of ${ob.total} steps; the rest skipped ${formatDate(ob.dismissedAt)}.`
                      : `${ob.done} of ${ob.total} steps done.`}
              </CardDescription>
            </CardHeader>
            {!company.isPlatformOwner && (
              <CardContent>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((ob.done / ob.total) * 100)}%` }} />
                </div>
              </CardContent>
            )}
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>{company.branding.wordmark || company.branding.logoUrl || company.branding.primaryColor ? "Customised." : "Using the defaults."}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-4">
                <Field label="Wordmark">{company.branding.wordmark ?? "—"}</Field>
                <Field label="Logo">{company.branding.logoUrl ? "Uploaded" : "—"}</Field>
                <Field label="Colour">
                  {company.branding.primaryColor ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3.5 rounded-full border border-border" style={{ background: company.branding.primaryColor }} />
                      {company.branding.primaryColor}
                    </span>
                  ) : (
                    "—"
                  )}
                </Field>
              </dl>
            </CardContent>
          </GlassCard>
        </div>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
            <CardDescription>{company.enabledPanels ? `${company.enabledPanels.length} enabled.` : "No choice recorded, so every product is on."}</CardDescription>
          </CardHeader>
          {company.enabledPanels && (
            <CardContent className="flex flex-wrap gap-1.5">
              {company.enabledPanels.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </CardContent>
          )}
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Domains</CardTitle>
            <CardDescription>
              {domains.length ? "Addresses this workspace answers on (when active)." : "No domain records — it answers on its subdomain only."}{" "}
              <Link href={`/console/domains?q=${encodeURIComponent(company.slug)}`} className="underline-offset-2 hover:underline">
                All domains
              </Link>
            </CardDescription>
          </CardHeader>
          {domains.length > 0 && (
            <CardContent>
              <ul className="divide-y divide-border text-sm" id="company-domains">
                {domains.map((d) => (
                  <li key={d.host} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 font-medium break-all">{d.host}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{d.kind === "subdomain" ? "Subdomain" : "Custom"}</Badge>
                      {d.isPrimary && <Badge variant="outline">Primary</Badge>}
                      <DnsBadge status={d.status} />
                      <SslBadge ssl={d.hosting.ssl} error={d.hosting.error} />
                      {d.hosting.error && (
                        <Badge variant="destructive" title={d.hosting.error}>
                          Hosting error
                        </Badge>
                      )}
                      <DomainActions
                        domain={{ host: d.host, companyName: company.name, kind: d.kind, status: d.status, isPrimary: d.isPrimary, removable: d.removable, localOnly: d.hosting.providerId === null }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </GlassCard>

        {!company.isPlatformOwner && (
          <>
          <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
            <CardDescription>Switch a product off for this company only. A product switched off globally (Products page) is off for everyone.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyPanelsCard
              companyId={company.id}
              canManage={can(user, "panels.manage")}
              rows={registry.map((p) => ({ key: p.key, name: p.name, description: p.description, core: p.core, globallyActive: p.active || p.core, off: disabledHere.has(p.key) }))}
            />
          </CardContent>
        </GlassCard>

        {overrides && <CompanyOverridesCard companyId={company.id} companyName={company.name} detail={overrides} canManage={can(user, "subscriptions.manage")} />}

        {subscription && <FreeAccessCard companyId={company.id} companyName={company.name} free={subscription.status === "internal"} canManage={can(user, "subscriptions.manage")} />}

        {maintenance && can(user, "companies.status") && <MaintenanceForm initial={maintenance} companyId={company.id} companyName={company.name} />}

        <CompanyAddonsCard
            companyId={company.id}
            held={heldAddons.flatMap((h) => {
              const a = allAddons.find((x) => x._id === h.addonId);
              return [{ addonId: h.addonId, name: a?.name ?? h.addonId, effect: a ? describeAddonEffect(a) : "", quantity: h.quantity, complimentary: Boolean(h.complimentary) }];
            })}
            available={allAddons.filter((a) => a.active).map((a) => ({ id: a._id, name: a.name, maxQuantity: a.type === "module" ? 1 : a.maxQuantity }))}
          />
          </>
        )}
    </div>
  );
}
