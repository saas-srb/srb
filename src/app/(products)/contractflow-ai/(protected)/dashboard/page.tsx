import { redirect } from "next/navigation";
import CfDashboardView from "@/components/products/contractflow-ai/CfDashboardView";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { parseCfFilters } from "@/lib/products/contractflow-ai/dashboard/filters";
import { loadCfDashboard } from "@/lib/products/contractflow-ai/dashboard/fetch";
import { resolveRange } from "@/lib/products/playbook-ai/dashboard/ranges";
import { lpmsCan } from "@/lib/lpms-roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function CfDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await getViewer();
  if (!v) redirect("/contractflow-ai/login");
  const range = resolveRange(sp.range, Date.now(), { from: sp.from, to: sp.to });
  const data = await loadCfDashboard(v, range, parseCfFilters(sp));
  if (!data) redirect("/contractflow-ai/documents");
  return <CfDashboardView data={data} custom={range.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : undefined} canSettings={lpmsCan({ roles: v.roles, permissionOverrides: v.overrides } as never, "MANAGE_POLICIES")} />;
}
