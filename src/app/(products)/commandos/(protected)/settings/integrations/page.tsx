import type { Metadata } from "next";
import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SidePanel from "@/components/products/commandos/SidePanel";
import PanelTabs from "@/components/products/commandos/PanelTabs";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES, canUseSrb, providerByKey } from "@/lib/platform/connections/catalog";
import { USED_BY, cardStatus, categoryOf, type IntegrationCard } from "@/lib/platform/connections/cards";
import { listConnectionViews } from "@/lib/platform/connections/store";
import { fromEnv } from "@/lib/platform/connections/resolve";
import { isPlatformEncryptionConfigured } from "@/lib/platform/crypto";
import { listCompanyIntegrations } from "@/lib/products/commandos/company";
import { listPanels } from "@/lib/platform/panels/store";
import { getIntegrationsStatus } from "@/lib/dealflow-ai/integrations";
import DealFlowSyncStatus from "@/components/platform/DealFlowSyncStatus";
import ChatbotConfigPage from "@/components/products/sitecraft-ai/chatbot/ChatbotConfigPage";
import KnowledgeBasePage from "@/components/products/sitecraft-ai/chatbot/KnowledgeBasePage";
import VoiceConfigPage from "@/components/products/sitecraft-ai/chatbot/VoiceConfigPage";
import ConversationsScreen from "../../chatbot/conversations/ConversationsScreen";
import VoiceConversationsScreen from "../../chatbot/voice-conversations/VoiceConversationsScreen";
import { requireChatbotViewAccess } from "../../chatbot/access";
import ConnectionPanel, { type PanelProvider } from "./ConnectionPanel";
import IntegrationsView from "./IntegrationsView";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };

const PATH = "/commandos/settings/integrations";

/** The cards: ONE per provider or service, even when several products use it. */
async function buildCards(registryNames: Record<string, string>): Promise<IntegrationCard[]> {
  const [views, managed] = await Promise.all([listConnectionViews(), listCompanyIntegrations().catch(() => [])]);
  const managedByKey = new Map(managed.map((m) => [m.key, m]));
  const usedBy = (key: string) => (USED_BY[key] ?? []).flatMap((k) => (k === "*" ? ["Every product"] : registryNames[k] ? [registryNames[k]] : []));
  const cards: IntegrationCard[] = [];
  for (const p of CONNECTION_PROVIDERS.filter((x) => !HIDDEN_FROM_COMPANIES.includes(x.key))) {
    const view = views[p.key];
    if (p.managedElsewhere) {
      const m = managedByKey.get((p.key === "domains" ? "domain" : p.key) as "webhooks" | "razorpay" | "domain");
      const status = cardStatus({ canSrb: false, srbReady: false, mode: "own", hasOwnKeys: false, lastTestOk: null, managedConnected: m ? m.connected : false });
      cards.push({ key: p.key, name: p.name, description: p.description, category: categoryOf(p.key), status, note: m?.status ?? null, usedBy: usedBy(p.key), kind: "page", href: p.managedElsewhere.href, canSrb: false });
      continue;
    }
    const canSrb = canUseSrb(p.key);
    const srbReady = p.group === "email" || p.key === "vapid" ? true : canSrb ? Boolean(await fromEnv(p.key)) : false;
    const status = cardStatus({ canSrb, srbReady, mode: view?.mode ?? "srb", hasOwnKeys: Boolean(view?.saved), lastTestOk: view?.lastTest ? view.lastTest.ok : null });
    const note = status === "using_srb" ? "SelfRun's account is used. Nothing to set up." : status === "needs_attention" ? `Last test failed: ${view?.lastTest?.message ?? "check your keys"}` : status === "using_own" ? "Your own account is used." : canSrb ? "SelfRun's account is not available right now. Connect your own." : "Connect your account to use it.";
    cards.push({ key: p.key, name: p.key === "elevenlabs" ? "Voice (ElevenLabs)" : p.name, description: p.description, category: categoryOf(p.key), status, note, usedBy: usedBy(p.key), kind: "panel", canSrb });
  }
  // The AI chatbot: its configuration, knowledge and conversations are one card (the AI account itself is the OpenAI card).
  const openai = cards.find((c) => c.key === "openai");
  cards.push({ key: "ai-chatbot", name: "AI Chatbot", description: "The assistant on your website: how it answers, what it knows and the conversations it has had.", category: "ai", status: openai?.status ?? "not_set_up", note: openai ? "Uses the OpenAI account below." : null, usedBy: usedBy("ai-chatbot"), kind: "panel", canSrb: true });
  cards.push({ key: "webhooks", name: "Webhooks and automations", description: "Send a signed webhook, email, in-app notice or WhatsApp message when something happens in your workspace.", category: "webhooks", status: "using_own", note: "Rules you make yourself.", usedBy: usedBy("webhooks"), kind: "page", href: "/commandos/settings/automations", canSrb: false });
  return cards;
}

/** One place for every third-party service. A card per service; Configure opens it in a panel on the right. */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspaceAccess("company.integrations");
  const sp = await searchParams;
  const open = typeof sp.open === "string" ? sp.open : "";
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const registry = await listPanels();
  const names = Object.fromEntries(registry.map((p) => [p.key, p.name]));
  const [cards, dealFlowStatus] = await Promise.all([buildCards(names), getIntegrationsStatus()]);
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const shown = q ? cards.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(q)) : cards;
  const current = cards.find((c) => c.key === open && c.kind === "panel");
  const hrefFor = (t: string) => `${PATH}?open=${open}&tab=${t}`;

  let panel: React.ReactNode = null;
  if (current) {
    const p = providerByKey.get(current.key);
    const views = await listConnectionViews();
    const view = views[current.key];
    const panelProvider: PanelProvider | null = p ? {
      key: p.key, name: current.name, description: p.description, fields: p.fields, docsUrl: p.docsUrl ?? null, note: p.note ?? null, testable: !!p.testable,
      canSrb: canUseSrb(p.key), srbReady: p.group === "email" || p.key === "vapid" ? true : canUseSrb(p.key) ? Boolean(await fromEnv(p.key)) : false,
      mode: view?.mode ?? "srb", saved: view ? { values: view.values, secrets: view.secrets, lastTest: view.lastTest, updatedAt: view.updatedAt } : null,
    } : null;
    const ready = isPlatformEncryptionConfigured();
    if (current.key === "ai-chatbot") {
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
          description={<>Every outside service your workspace uses, in one place. By default SelfRun&apos;s own account (SRB) is used so nothing needs setting up; connect your own account only if you want to.</>}
        />
        <form method="get" action={PATH} role="search" className="max-w-sm">
          <label htmlFor="int-q" className="sr-only">Search integrations</label>
          <input id="int-q" name="q" defaultValue={q} placeholder="Search: email, OpenAI, WhatsApp, Instagram" className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" />
        </form>
        <IntegrationsView cards={shown} />
        {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;.</p>}
        <section id="dealflow-sync" className="space-y-4 border-t border-border/50 pt-6">
          <div>
            <h2 className="text-xl font-semibold">DealFlow AI sync</h2>
            <p className="text-sm text-muted-foreground">Connection status, lead sources and careers applications for DealFlow.</p>
          </div>
          <DealFlowSyncStatus integrations={dealFlowStatus} />
        </section>
      </div>
      {current && panel && (
        <SidePanel title={current.name} description={current.description} closeHref={PATH}>{panel}</SidePanel>
      )}
    </div>
  );
}
