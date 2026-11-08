import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { originFromHeaders } from "@/lib/products/viralpulse-ai/oauth-redirect";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SectionCard, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { BrandForm, AiSettingsForm, IntegrationsPanel } from "@/components/products/viralpulse-ai/SettingsForms";
import PublishingSettingsForm from "@/components/products/viralpulse-ai/PublishingSettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getViralPulseHealth } from "@/lib/products/viralpulse-ai/health";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";
import { getPublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { getBrandSnapshot, serviceCatalogue, listLiveOffers } from "@/lib/products/viralpulse-ai/brand";
import { listIntegrationViews } from "@/lib/products/viralpulse-ai/integrations";
import { isEncryptionConfigured } from "@/lib/products/viralpulse-ai/crypto";
import { isOpenAIConfigured } from "@/lib/openai";
import { SMMS_PERMISSIONS, SMMS_PERMISSION_META, SMMS_ROLE_META, SMMS_ROLE_PERMISSIONS } from "@/lib/smms-roles";
import { formatDate, formatDateTime } from "@/lib/utils";

const SECTION_TITLE: Record<string, string> = {
  brand: "Brand kit",
  publishing: "Publishing",
  ai: "AI & models",
  integrations: "Connected accounts",
  health: "System health",
  roles: "Team & roles",
};

const ROLES = ["smms_employee", "smms_specialist", "smms_manager", "smms_admin"] as const;

export default async function ViralpulseSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const sp = await searchParams;
  const origin = originFromHeaders(await headers());
  const [settings, publishSettings, snap, integrations, offers, openaiReady, health] = await Promise.all([
    getSettings(),
    getPublishSettings(),
    getBrandSnapshot(),
    listIntegrationViews(origin),
    listLiveOffers(10),
    isOpenAIConfigured(),
    getViralPulseHealth(origin),
  ]);

  const allowedTabs = ["brand", "publishing", "ai", "integrations", "health", "roles"];
  const tab = allowedTabs.includes(sp.tab ?? "") ? sp.tab! : "brand";

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "ViralPulse AI" },
        ]}
        title={<>ViralPulse AI Settings</>}
        description={<>Brand context for the AI, publishing rules, OpenAI settings, platform connections and role permissions.</>}
      />

      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.connected && <Notice tone="ok">Connected. Choose which page / account / location each platform publishes to.</Notice>}

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="brand">Brand kit</TabsTrigger>
          <TabsTrigger value="publishing">Publishing</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; models</TabsTrigger>
          <TabsTrigger value="integrations">Connected accounts</TabsTrigger>
          <TabsTrigger value="health">System health</TabsTrigger>
          <TabsTrigger value="roles">Team &amp; roles</TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="mt-4 space-y-4">
          <SectionCard title="Read live from other products" description="Not copied into ViralPulse — edit them where they live.">
            <ul className="space-y-1 text-sm">
              <li>{`Company: ${snap.companyName} · ${snap.website}`} <span className="text-xs text-muted-foreground">(TalentOS → Settings → Company)</span></li>
              <li>{`Service catalogue: ${serviceCatalogue().filter((s) => s.value === s.group).map((s) => s.label).join(", ")}`} <span className="text-xs text-muted-foreground">(public site)</span></li>
              <li>{`Active offers: ${offers.length ? offers.map((o) => `${o.title} (${o.badge}, until ${formatDate(o.validUntil)})`).join("; ") : "none right now"}`} <span className="text-xs text-muted-foreground">(DealFlow → Offers)</span></li>
              <li>Clients: picked per campaign/post from SprintOS clients</li>
            </ul>
          </SectionCard>
          <SectionCard title="Marketing voice" description="Used in every AI prompt (campaigns, ads, posts, generator).">
            <BrandForm brand={settings.brand} services={serviceCatalogue().map((s) => s.value)} canGenerate={true} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="publishing" className="mt-4 space-y-4">
          <SectionCard title="Publishing switches" description="These apply to the whole company and are recorded in the audit log.">
            <PublishingSettingsForm initial={publishSettings} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-4">
          <SectionCard title="OpenAI" description="OpenAI is the only AI provider in this product. The key stays on the server.">
            <ul className="mb-4 space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                {openaiReady ? <Check className="size-4 text-emerald-600" /> : <Minus className="size-4 text-rose-600" />}
                {`OPENAI_API_KEY ${openaiReady ? "is set" : "is NOT set — generation is unavailable"}`}
              </li>
              <li className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Text: Responses API with strict JSON-schema output; images: Images API</li>
              <li className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Every generation is stored as a version; nothing is published automatically</li>
            </ul>
            <AiSettingsForm ai={settings.ai} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Notice tone="info">Connections are used only when someone presses Publish or approves a schedule. Paid ads (incl. Google Ads) are never created from here — they&apos;re launched in each ads manager; their results come in through DealFlow → Campaigns imports.</Notice>
          <IntegrationsPanel items={integrations} encryptionReady={isEncryptionConfigured()} />
        </TabsContent>

        <TabsContent value="health" className="mt-4 space-y-4">
          {health ? (
            <>
              <Notice tone={health.status === "ok" ? "ok" : "error"}>
                {health.status === "ok" ? "Everything ViralPulse depends on is working." : `${health.attentionCount} item${health.attentionCount === 1 ? "" : "s"} need attention.`}
              </Notice>
              {health.groups.map((g) => (
                <SectionCard key={g.id} title={g.title} description={g.status === "ok" ? "OK" : "Needs attention"}>
                  <ul className="space-y-3 text-sm">
                    {g.items.map((i) => (
                      <li key={i.id} className="flex items-start gap-2">
                        {i.status === "ok" ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="OK" />
                        ) : (
                          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-label="Needs attention" />
                        )}
                        <div>
                          <p className="font-medium">{i.label}</p>
                          <p className="text-muted-foreground">{i.detail}</p>
                          {i.fix && <p className="text-xs">{`How to fix: ${i.fix}`}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ))}
              <p className="text-[11px] text-muted-foreground">{`Checked ${formatDateTime(health.checkedAt)}`}</p>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <SectionCard title="Role permissions" description="Defaults per role. Roles are assigned (and individual capabilities overridden) under Admin → Users.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r} className="text-center">{SMMS_ROLE_META[r].label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SMMS_PERMISSIONS.map((p) => (
                    <TableRow key={p}>
                      <TableCell>
                        <p className="text-sm font-medium">{SMMS_PERMISSION_META[p].label}</p>
                        <p className="text-[11px] text-muted-foreground">{SMMS_PERMISSION_META[p].description}</p>
                      </TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          {SMMS_ROLE_PERMISSIONS[r].includes(p) ? (
                            <Check className="mx-auto size-4 text-emerald-600" aria-label="Allowed" />
                          ) : (
                            <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
