"use client";

import HubSidebar from "@/components/hub/HubSidebar";
import SidePanel from "@/components/products/commandos/SidePanel";
import PanelTabs from "@/components/products/commandos/PanelTabs";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import IntegrationsView from "@/app/(products)/commandos/(protected)/settings/integrations/IntegrationsView";
import ConnectionPanel from "@/app/(products)/commandos/(protected)/settings/integrations/ConnectionPanel";
import ProductCardsView from "@/app/(products)/commandos/(protected)/settings/products/ProductCardsView";
import EmailSenderManager from "@/app/(products)/commandos/(protected)/settings/email/EmailSenderManager";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NavSection } from "@/lib/products/commandos/nav";
import type { IntegrationCard } from "@/lib/platform/connections/cards";
import type { ProductStatus } from "@/lib/products/commandos/product-status";
import type { SenderView } from "@/lib/platform/email/sender";

export interface HarnessData {
  view: string;
  nav: NavSection[];
  cards: IntegrationCard[];
  statuses: Record<string, ProductStatus>;
  locked: Record<string, boolean>;
  sender: SenderView;
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
                <PanelPageHeader title={<>Product settings</>} description={<>One card for each product. Open Configure to change that product&apos;s settings without leaving this page.</>} />
                <ProductCardsView statuses={d.statuses} locked={d.locked} />
              </>
            ) : v === "domains" ? (
              <section id="sender-email" className="rounded-2xl border border-border/50 bg-card p-5">
                <h2 className="text-lg font-semibold">Send emails from your own address</h2>
                <p className="mb-4 text-sm text-muted-foreground">By default your emails go out from SRB&apos;s address, <strong>SelfRun &lt;no-reply@selfrun.example&gt;</strong>, and nothing needs setting up. If you would rather they come from your own address, do these three steps.</p>
                <EmailSenderManager initial={d.sender} defaultName="Northwind Demo" suggested={null} platformFrom="SelfRun <no-reply@selfrun.example>" actions={{ save: async () => ({ ok: true, value: d.sender }), check: async () => ({ ok: true, value: d.sender }), remove: noop }} />
              </section>
            ) : (
              <>
                <PanelPageHeader title={<>Integrations</>} description={<>Every outside service your workspace uses, in one place. By default SelfRun&apos;s own account (SRB) is used so nothing needs setting up; connect your own account only if you want to.</>} />
                <IntegrationsView cards={d.cards} />
              </>
            )}
          </div>
          {v === "panel-srb" && <SidePanel title="OpenAI" description="The AI behind assistants, content generation and your website chatbot." closeHref="/dev-editor-harness/restructure?view=integrations"><ConnectionPanel p={provider("srb")} encryptionReady /></SidePanel>}
          {v === "panel-own" && <SidePanel title="OpenAI" description="The AI behind assistants, content generation and your website chatbot." closeHref="/dev-editor-harness/restructure?view=integrations"><ConnectionPanel p={provider("own")} encryptionReady /></SidePanel>}
          {v === "chatbot" && (
            <SidePanel title="AI Chatbot" description="The assistant on your website: how it answers, what it knows and the conversations it has had." closeHref="/dev-editor-harness/restructure?view=integrations">
              <PanelTabs tabs={[{ key: "config", label: "Overview and AI settings" }, { key: "knowledge", label: "Knowledge base" }, { key: "conversations", label: "Conversations" }]} active="config" hrefFor={(t) => `?view=chatbot&tab=${t}`} />
              <div className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm"><p className="font-medium">Chatbot settings (the existing screen shows here)</p><p className="text-muted-foreground">Name, greeting, model, tone and the questions it should never answer.</p></div>
            </SidePanel>
          )}
          {v === "product-panel" && (
            <SidePanel title="SprintOS settings" description="Project management: tasks, milestones, timesheets and teams." closeHref="/dev-editor-harness/restructure?view=products">
              <div className="space-y-3 rounded-2xl border border-border/60 p-4 text-sm"><p className="font-medium">Project settings (the existing screen shows here)</p><p className="text-muted-foreground">Project categories, technology suggestions and default currency.</p></div>
            </SidePanel>
          )}
        </div>
      )}
    </TooltipProvider>
  );
}
