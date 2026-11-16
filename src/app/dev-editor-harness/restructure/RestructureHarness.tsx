"use client";

import HubSidebar from "@/components/hub/HubSidebar";
import SidePanel from "@/components/products/commandos/SidePanel";
import PanelTabs from "@/components/products/commandos/PanelTabs";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { SettingsFilters, SettingsGroups, SettingsGridSkeleton } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { filterCards, readFilter, type SettingsCategory } from "@/components/settings/model";
import { integrationCardData, productCardData, slugOf } from "@/components/settings/adapters";
import { CARD_CATEGORIES } from "@/lib/platform/connections/cards";
import ConnectionPanel from "@/app/(products)/commandos/(protected)/settings/integrations/ConnectionPanel";
import { PRODUCT_GROUPS, PRODUCT_GROUP_NOTES } from "@/app/(products)/commandos/(protected)/settings/products/product-groups";
import { SLUG_TO_PANEL } from "@/lib/products/commandos/product-status";
import { ProfileStep } from "@/app/(products)/commandos/(protected)/onboarding/OnboardingWizard";
import IdentitySummary from "@/components/products/commandos/IdentitySummary";
import EmailSenderManager from "@/app/(products)/commandos/(protected)/settings/email/EmailSenderManager";
import NotificationDrawer from "@/components/platform/NotificationDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NavSection } from "@/lib/products/commandos/nav";
import type { IntegrationCard } from "@/lib/platform/connections/cards";
import type { ProductStatus } from "@/lib/products/commandos/product-status";
import type { SenderView } from "@/lib/platform/email/sender";

export interface HarnessData {
  view: string;
  q?: string;
  status?: string;
  nav: NavSection[];
  cards: IntegrationCard[];
  statuses: Record<string, ProductStatus>;
  locked: Record<string, boolean>;
  sender: SenderView;
}

const CONNECTIONS: Record<string, string[]> = { agentos: ["Email", "OpenAI", "Twilio", "Voice (ElevenLabs)"], "cashflow-ai": ["Email", "Razorpay"], "rankmax-ai": ["Email", "OpenAI", "Google (Search Console, Analytics & Indexing)", "Google PageSpeed Insights"], talentos: ["Email", "Push notifications", "Razorpay", "Voice (ElevenLabs)"], sprintos: ["Email"], spendiq: ["Email", "Razorpay"] };

function IntegrationsHarness({ cards, q, status }: { cards: IntegrationCard[]; q?: string; status?: string }) {
  const filter = readFilter({ q, status });
  const data = filterCards(cards.map(integrationCardData), filter);
  return (
    <>
      <SettingsFilters action="/dev-editor-harness/restructure" filter={filter} categories={CARD_CATEGORIES} searchPlaceholder="Search by name: email, OpenAI, WhatsApp, Instagram" />
      <SettingsGroups cards={data} categories={CARD_CATEGORIES} />
    </>
  );
}

function ProductsHarness({ statuses, locked }: { statuses: Record<string, ProductStatus>; locked: Record<string, boolean> }) {
  const categories: SettingsCategory[] = PRODUCT_GROUPS.map((g) => ({ key: slugOf(g.label), title: g.label, description: PRODUCT_GROUP_NOTES[g.label] }));
  const data = PRODUCT_GROUPS.flatMap((g) => g.products.map((p) => productCardData({ key: p.key, name: p.name, description: p.description, group: slugOf(g.label), panelKey: SLUG_TO_PANEL[p.key], connections: CONNECTIONS[p.key] ?? [] }, statuses[p.key] ?? "ready", Boolean(locked[p.key]))));
  const icons = new Map(PRODUCT_GROUPS.flatMap((g) => g.products).map((p) => [p.key, p.icon]));
  return (
    <>
      <SettingsFilters action="/dev-editor-harness/restructure" filter={readFilter({})} categories={categories} searchPlaceholder="Search by product name" />
      <SettingsGroups cards={data} categories={categories} iconFor={(c) => icons.get(c.key)} />
    </>
  );
}

const noop = async () => ({ ok: true as const, value: null });

/** Development-only (404 in production): the real Workspace restructure components over sample data, no sign-in and no database. */
export default function RestructureHarness({ d }: { d: HarnessData }) {
  const v = d.view;
  const provider = (mode: "srb" | "own") => ({
    key: "openai", name: "OpenAI", description: "The AI behind assistants, content generation and your website chatbot.", docsUrl: "https://platform.openai.com/api-keys", note: null, testable: true,
    canSrb: true, srbReady: true, mode,
    fields: [{ key: "apiKey", label: "API key", kind: "secret" as const, required: true, help: "Starts with sk-" }],
    saved: mode === "own" ? { values: {}, secrets: { apiKey: { set: true as const, last4: "7890" } }, lastTest: { ok: true, at: "2026-11-15T09:00:00Z", message: "Connected. The key works." }, updatedAt: "2026-11-15T09:00:00Z" } : null,
  });
  return (
    <TooltipProvider>
      {v.startsWith("sidebar") ? (
        <div className="mx-auto flex max-w-3xl gap-4 p-4">
          <aside className="w-64 shrink-0 rounded-3xl border border-border/50 bg-card/90"><HubSidebar nav={d.nav} /></aside>
          <p className="text-sm text-muted-foreground">{v === "sidebar-director" ? "Director" : "A person with SprintOS access only"}: the same sidebar, items they cannot use are locked.</p>
        </div>
      ) : (
        <div className="min-h-screen bg-muted/70 px-4 py-6 dark:bg-background">
          <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
            {v.startsWith("products") || v === "product-panel" ? (
              <>
                <PanelPageHeader title={<>Product settings</>} description={<>Change how each product works.</>} />
                <ProductsHarness statuses={d.statuses} locked={d.locked} />
              </>
            ) : v === "identity" ? (
              <>
                <PanelPageHeader title={<>Company setup</>} description={<>Who your company is, kept once and used by every product.</>} />
                <ProfileStep initial={{ name: "Northwind Demo", legalName: "Northwind Technologies Pvt Ltd", industry: "software", size: "11-50", country: "India", currency: "INR", timezone: "Asia/Kolkata", website: "https://northwind.example", email: "hello@northwind.example", phone: "+91 20 5550 0100", addressLine1: "4th Floor, Tech Park", addressLine2: "Baner Road", city: "Pune", state: "Maharashtra", postalCode: "411045", gstin: "27AAPFU0939F1ZV", pan: "AAPFU0939F", cin: "", fiscalYearStartMonth: 4, language: "en" }} timezones={["Asia/Kolkata", "Asia/Dubai", "UTC"]} onIndustry={() => {}} onDone={() => {}} saveLabel="Save profile" />
                <h2 className="pt-4 text-base font-semibold">What a product shows (SpendIQ settings)</h2>
                <IdentitySummary title="Company identity" note="Printed on purchase orders and invoices. Set once for the whole company." rows={[{ label: "Company name", value: "Northwind Demo" }, { label: "Address", value: "4th Floor, Tech Park, Baner Road" }, { label: "City", value: "Pune" }, { label: "GSTIN", value: "27AAPFU0939F1ZV" }, { label: "PAN", value: "AAPFU0939F" }, { label: "Email", value: "hello@northwind.example" }]} />
              </>
            ) : v === "domains" ? (
              <section id="sender-email" className="rounded-2xl border border-border/50 bg-card p-5">
                <h2 className="text-lg font-semibold">Send emails from your own address</h2>
                <p className="mb-4 text-sm text-muted-foreground">By default your emails go out from SRB&apos;s address, <strong>SelfRun &lt;no-reply@selfrun.example&gt;</strong>, and nothing needs setting up. If you would rather they come from your own address, do these three steps.</p>
                <EmailSenderManager initial={d.sender} defaultName="Northwind Demo" suggested={null} platformFrom="SelfRun <no-reply@selfrun.example>" actions={{ save: async () => ({ ok: true, value: d.sender }), check: async () => ({ ok: true, value: d.sender }), remove: noop }} />
              </section>
            ) : (
              <>
                <PanelPageHeader title={<>Integrations</>} description={<>Connect the outside services you use.</>} />
                <IntegrationsHarness cards={d.cards} q={d.q} status={d.status} />
              </>
            )}
          </div>
          {v === "panel-srb" && <SidePanel title="OpenAI" description="Power assistants, chatbots and content writing with AI." icon={<IconTile icon="ai" />} badge={<StatusBadge status="using_srb" />} closeHref="/dev-editor-harness/restructure?view=integrations"><ConnectionPanel p={provider("srb")} encryptionReady /></SidePanel>}
          {v === "panel-own" && <SidePanel title="OpenAI" description="Power assistants, chatbots and content writing with AI." icon={<IconTile icon="ai" />} badge={<StatusBadge status="using_own" />} closeHref="/dev-editor-harness/restructure?view=integrations"><ConnectionPanel p={provider("own")} encryptionReady /></SidePanel>}
          {v === "drawer" && <div className="p-6"><NotificationDrawer href="/commandos/notifications" unread={2} panel="workspace" actor="staff" panelTitle="CommandOS" /></div>}
          {v === "skeleton" && <SettingsGridSkeleton />}
          {v === "chatbot" && (
            <SidePanel title="AI Chatbot" description="Answer visitors on your website with an AI assistant." icon={<IconTile icon="ai" />} badge={<StatusBadge status="using_srb" />} closeHref="/dev-editor-harness/restructure?view=integrations">
              <PanelTabs tabs={[{ key: "config", label: "Overview and AI settings" }, { key: "knowledge", label: "Knowledge base" }, { key: "conversations", label: "Conversations" }]} active="config" hrefFor={(t) => `?view=chatbot&tab=${t}`} />
              <div className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm"><p className="font-medium">Chatbot settings (the existing screen shows here)</p><p className="text-muted-foreground">Name, greeting, model, tone and the questions it should never answer.</p></div>
            </SidePanel>
          )}
          {v === "product-panel" && (
            <SidePanel title="SprintOS settings" description="Manage projects, tasks, timesheets and teams." icon={<IconTile icon="settings" />} badge={<StatusBadge status="ready" />} closeHref="/dev-editor-harness/restructure?view=products">
              <div className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm"><p className="font-medium">Project settings (the existing screen shows here)</p><p className="text-muted-foreground">Project categories, technology suggestions and default currency.</p></div>
            </SidePanel>
          )}
        </div>
      )}
    </TooltipProvider>
  );
}
