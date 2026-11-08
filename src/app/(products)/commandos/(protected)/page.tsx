import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getWorkspaceNav } from "@/lib/products/commandos/access";
import { loadExecutiveOverview } from "@/lib/products/commandos/executive-overview";
import { getPanelHeadlineStats, isPanelKey } from "@/lib/products/commandos/panel-analytics";
import { PanelPerformanceMatrix } from "@/components/products/commandos/CommandCenterSections";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.split(/[._-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || email;
}

export default async function HubDashboardPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");

  // The matrix numbers come from the executive loader (null for anyone without the Command Center permission).
  const executive = await loadExecutiveOverview({ roles: user.roles, permissionOverrides: user.permissionOverrides ?? null });

  // Product access comes from the Workspace navigation (roles and permission overrides).
  const session = await getWorkspaceNav();
  const allowed = new Set(session?.nav.allowed ?? []);
  const [registry, unavailable] = await Promise.all([listPanels(), currentCompanyId().then(unavailablePanelKeys)]);
  const registryNames = Object.fromEntries(registry.map((p) => [p.key, whiteLabelProductName(p.name)]));
  // Every product the Product Registry lists (and that is switched on for this company), in its display order.
  const shownPanels = registry.filter((p) => !unavailable.has(p.key)).map((p) => ({ ...p, name: whiteLabelProductName(p.name) }));
  const dashboardPanels = shownPanels.filter((panel) => panel.key !== "workspace" && panel.key !== "website");
  // The registry uses product keys, while a few navigation entries have
  // established keys of their own (the dashboard, portal and service products).
  const productNavKey = (key: string) => ({
    workspace: "dashboard",
    portal: "panel.portal",
    support: "panel.support",
    website: "panel.website",
  }[key] ?? `product.${key}`);
  const matrixPanels = dashboardPanels.map((p) => p.key).filter((k) => allowed.has(productNavKey(k)));
  const analyticsPanels = dashboardPanels.map((p) => p.key).filter((k) => allowed.has(`analytics.${k}`));

  const headline = Object.fromEntries(
    await Promise.all(matrixPanels.filter(isPanelKey).map(async (k) => [k, await getPanelHeadlineStats(k)] as const)),
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="relative space-y-6">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Dashboard" }]}
        title={`${greeting}, ${nameFromEmail(user.email)}`}
        description={`Product performance across your workspace · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/talentos/me"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02] hover:bg-primary/90"
            >
              <UserCheck className="size-4" />
              My Attendance Portal
            </Link>
          </div>
        }
      />

      {/* Product performance matrix */}
      <section id="dashboard-overview" data-section="overview" className="space-y-6 rounded-3xl border border-border/60 border-t-2 border-t-primary/60 bg-muted/70 dark:bg-[color-mix(in_oklch,var(--background)_82%,black)] p-5 shadow-sm sm:p-6">
        <PanelPerformanceMatrix modules={executive?.modules} stats={headline} panels={matrixPanels} analyticsPanels={analyticsPanels} names={registryNames} unavailable={[...unavailable]} registry={dashboardPanels.map((p) => ({ key: p.key, name: p.name, description: p.description, route: p.route }))} />
      </section>

    </div>
  );
}
