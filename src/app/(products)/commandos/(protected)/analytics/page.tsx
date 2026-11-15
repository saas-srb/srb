import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, SearchX } from "lucide-react";
import AiVoiceInsight from "@/components/products/commandos/AiVoiceInsight";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getWorkspaceNav } from "@/lib/products/commandos/access";
import { isPanelKey, panelConfigs, type PanelKey } from "@/lib/products/commandos/panel-analytics";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import { AnalyticsFilterBar } from "@/components/products/commandos/AnalyticsFilterBar";
import { PanelAnalyticsBlock } from "./[panel]/PanelAnalyticsBlock";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function WorkspaceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");

  const sp = await searchParams;
  const q = first(sp.q)?.trim().toLowerCase() ?? "";
  const onlyPanel = first(sp.panel);
  const session = await getWorkspaceNav();
  const allowed = new Set(session?.nav.allowed ?? []);
  const [configs, registry, unavailable] = await Promise.all([
    panelConfigs(),
    listPanels(),
    currentCompanyId().then(unavailablePanelKeys),
  ]);
  const shownPanels = registry.filter((panel) => !unavailable.has(panel.key)).map((panel) => ({ ...panel, name: whiteLabelProductName(panel.name) }));
  const visibleKeys = shownPanels
    .map((panel) => panel.key)
    .filter((key) => allowed.has(`analytics.${key}`) || allowed.has(`product.${key}`));
  const analyticsPanels = shownPanels.filter((panel) => isPanelKey(panel.key) && allowed.has(`analytics.${panel.key}`));
  const matches = (key: string) => {
    const product = shownPanels.find((panel) => panel.key === key);
    const config = (configs as Record<string, { label: string; description: string }>)[key];
    const label = product?.name ?? config?.label ?? key;
    const description = product?.description ?? config?.description ?? "";
    return (!onlyPanel || onlyPanel === key) && (!q || label.toLowerCase().includes(q) || key.includes(q) || description.toLowerCase().includes(q));
  };
  const sections = visibleKeys.filter((key): key is PanelKey => isPanelKey(key) && allowed.has(`analytics.${key}`) && matches(key));

  // The same page for everyone: analytics of products the person has no access to are listed as locked entries below the open ones.
  const lockedAnalytics = shownPanels.filter((panel) => isPanelKey(panel.key) && !allowed.has(`analytics.${panel.key}`) && matches(panel.key));

  return (
    <div className="relative space-y-6">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Analytics" }]}
        title="Product Analytics"
        description="Explore the analytics available for the products your team can access."
        actions={
          <Link href="/commandos" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted">
            <ArrowLeft className="size-4" />
            Dashboard
          </Link>
        }
        filters={
          <AnalyticsFilterBar
            title="Analytics Search & Filter"
            fields={[
              { key: "q", label: "Search products", type: "text", placeholder: "Search analytics by product…" },
              { key: "panel", label: "Product", type: "select", options: analyticsPanels.map((panel) => ({ label: panel.name, value: panel.key })) },
            ]}
          />
        }
      />

      {allowed.has("manage.chatbot") && !onlyPanel && (!q || "ai voice chatbot".includes(q)) && <AiVoiceInsight />}

      {sections.length === 0 && !allowed.has("manage.chatbot") ? (
        <ExecutiveSection title="Product analytics">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
            <SearchX className="size-6" />
            {q || onlyPanel ? "No product matches your search." : "No product analytics are available for your account yet."}
          </div>
        </ExecutiveSection>
      ) : (
        sections.map((key) => (
          <section key={key} className="rounded-3xl border border-border/60 border-t-2 border-t-primary/60 bg-muted/70 p-5 shadow-sm dark:bg-[color-mix(in_oklch,var(--background)_82%,black)] sm:p-6">
            <PanelAnalyticsBlock panel={key} user={user} sp={sp} prefix={key} compact />
          </section>
        ))
      )}
      {(lockedAnalytics.length > 0 || !allowed.has("manage.chatbot")) && (
        <ExecutiveSection title="Locked analytics">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {!allowed.has("manage.chatbot") && (
              <li>
                <Link href="/commandos/locked?item=manage.chatbot" className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-sm text-muted-foreground opacity-70 hover:opacity-100" aria-label="AI and Voice analytics (no access)">
                  <span className="truncate">AI &amp; Voice</span>
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                </Link>
              </li>
            )}
            {lockedAnalytics.map((panel) => (
              <li key={panel.key}>
                <Link href={`/commandos/locked?item=analytics.${panel.key}`} className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-sm text-muted-foreground opacity-70 hover:opacity-100" aria-label={`${panel.name} analytics (no access)`}>
                  <span className="truncate">{panel.name} Analytics</span>
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </ExecutiveSection>
      )}
    </div>
  );
}
