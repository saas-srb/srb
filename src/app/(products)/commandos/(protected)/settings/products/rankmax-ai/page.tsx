import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Minus, RefreshCw } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import SeoSettingsForm from "@/components/products/rankmax-ai/SeoSettingsForm";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { SectionCard } from "@/components/products/rankmax-ai/SeoUi";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getSettings, integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { SEO_PERMISSIONS, SEO_PERMISSION_META, SEO_ROLE_META, SEO_ROLE_PERMISSIONS } from "@/lib/seo-roles";
import { formatDateTime } from "@/lib/utils";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

export const maxDuration = 300;

const ROLES = ["seo_employee", "seo_specialist", "seo_manager", "seo_admin"] as const;

export default async function RankmaxSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const [s, siteUrl] = await Promise.all([getSettings(), companySiteUrl()]);
  const env = await integrationEnv();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "RankMax AI" },
        ]}
        title={<>RankMax AI Settings</>}
        description={s.updatedAt ? `Last changed ${formatDateTime(s.updatedAt)}.` : "Using defaults."}
        actions={
          <>
            {s.integrations.gsc.enabled && env.google && (
              <JobButton
                body={{ job: "gsc-sync" }}
                label="Sync Search Console"
                busyLabel="Syncing…"
                icon={<RefreshCw className="size-3.5" data-icon="inline-start" />}
                successMessage="Search Console synced"
              />
            )}
            {s.integrations.ga4.enabled && env.google && (
              <JobButton
                body={{ job: "ga4-sync" }}
                label="Sync Analytics"
                busyLabel="Syncing…"
                icon={<RefreshCw className="size-3.5" data-icon="inline-start" />}
                successMessage="Analytics synced"
              />
            )}
          </>
        }
      />
      <SeoSettingsForm
        siteUrl={siteUrl}
        env={{
          serviceAccount: env.googleClientEmail,
          pagespeedKey: !!env.pagespeedKey,
          gscLastSync: s.integrations.gsc.lastSyncAt ? formatDateTime(s.integrations.gsc.lastSyncAt) : null,
          gscError: s.integrations.gsc.lastError,
          ga4LastSync: s.integrations.ga4.lastSyncAt ? formatDateTime(s.integrations.ga4.lastSyncAt) : null,
          ga4Error: s.integrations.ga4.lastError,
        }}
        initial={{
          siteOrigin: s.siteOrigin,
          maxPages: String(s.crawl.maxPages),
          concurrency: String(s.crawl.concurrency),
          timeoutMs: String(s.crawl.timeoutMs),
          checkExternalLinks: s.crawl.checkExternalLinks,
          maxExternalChecks: String(s.crawl.maxExternalChecks),
          excludePrefixes: s.crawl.excludePrefixes.join("\n"),
          titleMin: String(s.thresholds.titleMin),
          titleMax: String(s.thresholds.titleMax),
          descriptionMin: String(s.thresholds.descriptionMin),
          descriptionMax: String(s.thresholds.descriptionMax),
          thinContentWords: String(s.thresholds.thinContentWords),
          slowResponseMs: String(s.thresholds.slowResponseMs),
          staleContentDays: String(s.thresholds.staleContentDays),
          minInternalLinksIn: String(s.thresholds.minInternalLinksIn),
          auditFrequency: s.schedule.auditFrequency,
          syncSearchData: s.schedule.syncSearchData,
          verifyBacklinks: s.schedule.verifyBacklinks,
          defaultCountry: s.defaults.country,
          defaultLanguage: s.defaults.language,
          defaultDevice: s.defaults.device,
          defaultEngine: s.defaults.engine,
          gscEnabled: s.integrations.gsc.enabled,
          gscProperty: s.integrations.gsc.property,
          ga4Enabled: s.integrations.ga4.enabled,
          ga4PropertyId: s.integrations.ga4.propertyId,
          psiEnabled: s.integrations.psi.enabled,
          psiStrategy: s.integrations.psi.strategy,
        }}
      />
      <SectionCard
        title="Roles & permissions"
        description={
          <>
            Defaults per SEO role. Grant roles and override individual permissions per person in{" "}
            <Link href="/commandos/users" className="text-primary hover:underline">
              Admin → Users
            </Link>{" "}
            (Director). Every permission is enforced on the server.
          </>
        }
      >
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">{SEO_ROLE_META[r].label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SEO_PERMISSIONS.map((p) => (
                <TableRow key={p}>
                  <TableCell>
                    <span className="font-medium">{SEO_PERMISSION_META[p].label}</span>
                    <span className="block text-[11px] text-muted-foreground">{SEO_PERMISSION_META[p].description}</span>
                  </TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      {SEO_ROLE_PERMISSIONS[r].includes(p) ? (
                        <Check className="mx-auto size-4 text-emerald-600" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground/50" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
