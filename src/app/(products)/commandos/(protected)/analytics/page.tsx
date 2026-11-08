import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
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

      {sections.length === 0 ? (
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
    </div>
  );
}
