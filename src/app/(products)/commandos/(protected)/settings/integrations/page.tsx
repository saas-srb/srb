import type { Metadata } from "next";
import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SidePanel from "@/components/products/commandos/SidePanel";
import PanelTabs from "@/components/products/commandos/PanelTabs";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES, canUseSrb, providerByKey } from "@/lib/platform/connections/catalog";
import { CARD_COPY } from "@/lib/platform/connections/card-copy";
import { CARD_CATEGORIES, cardStatus, categoryOf, connectionRelevant, usedByProducts, type IntegrationCard, type RegistryProduct } from "@/lib/platform/connections/cards";
import { whatsAppSenderNotice } from "@/lib/platform/messaging";
import { listConnectionViews } from "@/lib/platform/connections/store";
import { platformServiceReady } from "@/lib/platform/connections/platform-services";
import { connectionStatus, noteFor } from "@/lib/platform/connections/summary";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { isPlatformEncryptionConfigured } from "@/lib/platform/crypto";
import { listCompanyIntegrations } from "@/lib/products/commandos/company";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { getIntegrationsStatus } from "@/lib/dealflow-ai/integrations";
import DealFlowSyncStatus from "@/components/platform/DealFlowSyncStatus";
import ChatbotConfigPage from "@/components/products/sitecraft-ai/chatbot/ChatbotConfigPage";
import KnowledgeBasePage from "@/components/products/sitecraft-ai/chatbot/KnowledgeBasePage";
import VoiceConfigPage from "@/components/products/sitecraft-ai/chatbot/VoiceConfigPage";
import ConversationsScreen from "../../chatbot/conversations/ConversationsScreen";
import VoiceConversationsScreen from "../../chatbot/voice-conversations/VoiceConversationsScreen";
import { requireChatbotViewAccess } from "../../chatbot/access";
import ConnectionPanel, { type PanelProvider } from "./ConnectionPanel";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { filterCards, readFilter } from "@/components/settings/model";
import { integrationCardData } from "@/components/settings/adapters";
import ManagedPanel from "./ManagedPanel";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };

const PATH = "/commandos/settings/integrations";

/** The cards: ONE per provider or service, even when several products use it. */
async function buildCards(registry: RegistryProduct[], unavailable: ReadonlySet<string>): Promise<IntegrationCard[]> {
  const [views, managed] = await Promise.all([listConnectionViews(), listCompanyIntegrations().catch(() => [])]);
  const managedByKey = new Map(managed.map((m) => [m.key, m]));
  const usedBy = (key: string) => usedByProducts(key, registry, unavailable);
  const cards: IntegrationCard[] = [];
  for (const p of CONNECTION_PROVIDERS.filter((x) => !HIDDEN_FROM_COMPANIES.includes(x.key))) {
    const view = views[p.key];
    if (p.managedElsewhere) {
      const m = managedByKey.get((p.key === "domains" ? "domain" : p.key) as "webhooks" | "razorpay" | "domain");
      const status = cardStatus({ canSrb: false, srbReady: false, mode: "own", hasOwnKeys: false, lastTestOk: null, managedConnected: m ? m.connected : false });
      // File storage is run by SRB inside the workspace database: always SRB, nothing to connect.
      if (p.key === "storage") { cards.push({ key: p.key, name: p.name, description: p.description, category: "storage", status: "using_srb", note: "The included storage is used. Nothing to set up.", usedBy: usedBy(p.key), kind: "page", href: p.managedElsewhere.href, canSrb: true, testable: true, appliesToAll: true }); continue; }
      cards.push({ key: p.key, name: p.name, description: p.description, category: categoryOf(p.key), status, note: m?.status ?? null, usedBy: usedBy(p.key), kind: "page", href: p.managedElsewhere.href, canSrb: false, testable: !!p.testable, appliesToAll: true });
      continue;
    }
    // "Included default" only when the platform really has the service set up: the same function the product summaries and the staff checklist use.
    const { status, canSrb } = await connectionStatus(p.key, view ?? null);
    const note = [noteFor(status, canSrb, view?.lastTest?.message), await whatsAppSenderNotice(p.key)].filter(Boolean).join(" ");
    cards.push({ key: p.key, name: p.key === "elevenlabs" ? "Voice (ElevenLabs)" : p.name, description: p.description, category: categoryOf(p.key), status, note, usedBy: usedBy(p.key), kind: "panel", canSrb, testable: !!p.testable, appliesToAll: true });
  }
  // The AI chatbot: its configuration, knowledge and conversations are one card (the AI account itself is the OpenAI card).
  const openai = cards.find((c) => c.key === "openai");
  cards.push({ key: "ai-chatbot", name: "AI Chatbot", description: "The assistant on your website: how it answers, what it knows and the conversations it has had.", category: "ai", status: openai?.status ?? "not_set_up", note: openai ? "Uses the OpenAI account below." : null, usedBy: usedBy("ai-chatbot"), kind: "panel", canSrb: true, testable: false, appliesToAll: true });
  cards.push({ key: "dealflow-sync", name: "Lead sources", description: "Where your leads and job applications come from.", category: "leads", status: "ready", note: null, usedBy: usedBy("dealflow-sync"), kind: "panel", canSrb: false, testable: false, appliesToAll: true });
  cards.push({ key: "webhooks", name: "Webhooks and automations", description: "Send a signed webhook, email, in-app notice or WhatsApp message when something happens in your workspace.", category: "webhooks", status: "using_own", note: "Rules you make yourself.", usedBy: usedBy("webhooks"), kind: "page", href: "/commandos/settings/automations", canSrb: false, testable: true, appliesToAll: true });
  return cards.filter((c) => connectionRelevant(c.key, registry, unavailable));
}

/** One place for every third-party service. A card per service; Configure opens it in a panel on the right. */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspaceAccess("company.integrations");
  const sp = await searchParams;
  const open = typeof sp.open === "string" ? sp.open : "";
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const registry = await listPanels();
  const unavailable = await unavailablePanelKeys(await currentCompanyId());
  const [cards, dealFlowStatus] = await Promise.all([buildCards(registry, unavailable), getIntegrationsStatus()]);
  const filter = readFilter(sp);
  const data = cards.map(integrationCardData);
  const shown = filterCards(data, filter);
  const current = cards.find((c) => c.key === open && (c.kind === "panel" || c.testable));
  const hrefFor = (t: string) => `${PATH}?open=${open}&tab=${t}`;

  let panel: React.ReactNode = null;
  if (current) {
    const p = providerByKey.get(current.key);
    const views = await listConnectionViews();
    const view = views[current.key];
    const panelProvider: PanelProvider | null = p ? {
      key: p.key, name: current.name, description: p.description, fields: p.fields, docsUrl: p.docsUrl ?? null, note: p.note ?? null, testable: !!p.testable,
      canSrb: canUseSrb(p.key), srbReady: canUseSrb(p.key) ? await platformServiceReady(p.key) : false,
      isEmail: p.group === "email", mode: view?.mode ?? "srb", saved: view ? { values: view.values, secrets: view.secrets, lastTest: view.lastTest, updatedAt: view.updatedAt } : null,
    } : null;
    if (panelProvider) panelProvider.notice = await whatsAppSenderNotice(panelProvider.key);
    const ready = isPlatformEncryptionConfigured();
    if (current.kind === "page") {
      const meta = providerByKey.get(current.key);
      panel = <ManagedPanel provider={current.key} name={current.name} text={current.key === "storage" ? "Uploaded files, documents and backups are kept in your workspace storage, managed for you. Press Test to write, read back and remove a small test file." : current.key === "webhooks" ? "Press Test to send a signed test message to every webhook your automations call." : `${current.description} Press Test to check the connection safely.`} href={meta?.managedElsewhere?.href ?? (current.key === "webhooks" ? "/commandos/settings/automations" : null)} linkLabel={meta?.managedElsewhere ? `Open ${meta.managedElsewhere.label}` : current.key === "webhooks" ? "Open Automations" : null} />;
    } else if (current.key === "dealflow-sync") {
      panel = <DealFlowSyncStatus integrations={dealFlowStatus} />;
    } else if (current.key === "ai-chatbot") {
      await requireChatbotViewAccess();
      const t = ["config", "knowledge", "conversations"].includes(tab) ? tab : "config";
      panel = (
        <>
          <PanelTabs tabs={[{ key: "config", label: "Overview and AI settings" }, { key: "knowledge", label: "Knowledge base" }, { key: "conversations", label: "Conversations" }]} active={t} hrefFor={hrefFor} />
          {t === "config" ? <ChatbotConfigPage /> : t === "knowledge" ? <KnowledgeBasePage /> : <ConversationsScreen searchParams={Promise.resolve(sp as never)} />}
          <p className="text-xs text-muted-foreground">The chatbot uses the OpenAI account on its own card. <Link className="underline" href={`${PATH}?open=openai`}>Open the OpenAI card</Link>. The full numbers are on the <Link className="underline" href="/commandos/chatbot">AI Chatbot Dashboard</Link>.</p>
        </>
      );
    } else if (current.key === "elevenlabs") {
      await requireChatbotViewAccess();
      const t = ["connection", "settings", "conversations"].includes(tab) ? tab : "connection";
      panel = (
        <>
          <PanelTabs tabs={[{ key: "connection", label: "Account" }, { key: "settings", label: "Voice settings" }, { key: "conversations", label: "Voice conversations" }]} active={t} hrefFor={hrefFor} />
          {t === "connection" && panelProvider ? <ConnectionPanel p={panelProvider} encryptionReady={ready} /> : t === "settings" ? <VoiceConfigPage /> : <VoiceConversationsScreen searchParams={Promise.resolve(sp as never)} />}
        </>
      );
    } else if (panelProvider) {
      panel = <ConnectionPanel p={panelProvider} encryptionReady={ready} />;
    }
  }

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-6">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Integrations" }]}
          title={<>Integrations</>}
          description={<>Connect the outside services you use.</>}
        />
        <SettingsFilters action={PATH} filter={filter} categories={CARD_CATEGORIES} searchPlaceholder="Search by name: email, OpenAI, WhatsApp, Instagram" />
        <SettingsGroups cards={shown} categories={CARD_CATEGORIES} />
      </div>
      {current && panel && (
        <SidePanel title={current.name} description={CARD_COPY[current.key] ?? current.description} closeHref={PATH} expandable={current.key === "ai-chatbot" || current.key === "elevenlabs" || current.key === "dealflow-sync"} icon={<IconTile icon={integrationCardData(current).icon} />} badge={<StatusBadge status={integrationCardData(current).status} />}>{panel}</SidePanel>
      )}
    </div>
  );
}
