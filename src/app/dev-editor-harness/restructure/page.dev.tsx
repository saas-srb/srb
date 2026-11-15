import { notFound } from "next/navigation";
import RestructureHarness, { type HarnessData } from "./RestructureHarness";
import { resolveNav, type NavContext } from "@/lib/products/commandos/nav";
import { cardStatus, categoryOf, type IntegrationCard } from "@/lib/platform/connections/cards";
import type { SenderView } from "@/lib/platform/email/sender";
import type { ProductStatus } from "@/lib/products/commandos/product-status";

/**
 * Development-only (404 in production): the restructured Workspace over SAMPLE data. `?view=sidebar-director|sidebar-partial|integrations|panel-srb|panel-own|chatbot|products|product-panel|domains`.
 * Used by scripts/shot-restructure.ts. The sample cards, statuses and sender exist only here.
 */
export const dynamic = "force-dynamic";

const card = (key: string, name: string, description: string, c: Partial<Parameters<typeof cardStatus>[0]>, usedBy: string[], extra: Partial<IntegrationCard> = {}): IntegrationCard => {
  const status = cardStatus({ canSrb: true, srbReady: true, mode: "srb", hasOwnKeys: false, lastTestOk: null, ...c });
  return { key, name, description, category: categoryOf(key), status, note: status === "using_srb" ? "SelfRun's account is used. Nothing to set up." : status === "using_own" ? "Your own account is used." : status === "needs_attention" ? "Last test failed: the key was rejected." : "Connect your account to use it.", usedBy, kind: "panel", canSrb: true, ...extra };
};

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const view = (await searchParams).view ?? "integrations";
  const roles = view === "sidebar-partial" ? ["pms_manager"] : ["super_admin"];
  const ctx: NavContext = { user: { roles, permissionOverrides: null }, platformAccess: false, unavailablePanels: new Set(), panels: {} };
  const cards: IntegrationCard[] = [
    card("smtp", "SMTP", "Send workspace email through any SMTP server: your own mail host, Google Workspace, Microsoft 365, Zoho and more.", {}, ["Every product"]),
    card("resend", "Resend", "Send workspace email through Resend's API.", { mode: "own", hasOwnKeys: true, lastTestOk: true }, ["Every product"]),
    card("twilio", "Twilio", "Phone calls and SMS for lead follow-up and voice agents.", { mode: "own", hasOwnKeys: true, lastTestOk: false }, ["DealFlow AI", "AgentOS"]),
    card("razorpay", "Razorpay", "Collect invoice payments and pay salaries from your own Razorpay account.", { canSrb: false, managedConnected: false }, ["CashFlow AI", "SpendIQ"], { kind: "page", href: "/commandos/settings/payments", canSrb: false }),
    card("openai", "OpenAI", "The AI behind assistants, content generation and your website chatbot.", {}, ["AgentOS", "SiteCraft AI", "ViralPulse AI"]),
    card("ai-chatbot", "AI Chatbot", "The assistant on your website: how it answers, what it knows and the conversations it has had.", {}, ["SiteCraft AI"]),
    card("elevenlabs", "Voice (ElevenLabs)", "Natural voices for phone calls and your website voice assistant.", { srbReady: false }, ["AgentOS", "SiteCraft AI"]),
    card("google-service-account", "Google (Search Console, Analytics & Indexing)", "Search data and indexing for your SEO product.", {}, ["RankMax AI"]),
    card("meta", "Facebook & Instagram (Meta app)", "Publish to Facebook and Instagram.", { canSrb: false }, ["ViralPulse AI"]),
    card("webhooks", "Webhooks and automations", "Send a signed webhook, email, in-app notice or WhatsApp message when something happens.", { canSrb: false, managedConnected: true }, ["Every product"], { kind: "page", href: "/commandos/settings/automations", canSrb: false }),
    card("domains", "Custom domain", "Serve your workspace and website from your own domain with automatic SSL.", { canSrb: false, managedConnected: true }, ["SiteCraft AI"], { kind: "page", href: "/commandos/settings/domains", canSrb: false }),
  ];
  const statuses: Record<string, ProductStatus> = { agentos: "needs_setup", "rankmax-ai": "needs_setup", "viralpulse-ai": "needs_setup" };
  const locked: Record<string, boolean> = { cybervault: true, evaliq: true };
  const sender: SenderView = {
    domain: "northwind.example", localPart: "hello", fromName: "Northwind Demo", replyTo: "", status: "pending", from: "Northwind Demo <hello@northwind.example>", verifiedAt: null, checkedAt: "2026-11-15T09:00:00.000Z",
    records: [
      { type: "TXT", name: "send.northwind.example", value: "v=spf1 include:amazonses.com ~all", status: "pending", kind: "SPF" },
      { type: "CNAME", name: "resend._domainkey.northwind.example", value: "resend._domainkey.dkim.example.com", status: "pending", kind: "DKIM" },
      { type: "TXT", name: "_dmarc.northwind.example", value: "v=DMARC1; p=none;", status: "failed", kind: "DMARC" },
    ] as never,
  } as SenderView;
  const data: HarnessData = { view, nav: resolveNav(ctx).sections, cards, statuses, locked, sender };
  return <RestructureHarness d={data} />;
}
