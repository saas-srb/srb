import Tabs from "@/components/products/talentos/Tabs";
import MyDashboard from "@/components/products/talentos/MyDashboard";
import WorkforceDashboard from "@/components/products/talentos/WorkforceDashboard";
import { hrPage } from "@/lib/products/talentos/page-guard";
import { hrReach } from "@/lib/products/talentos/scope";

export const dynamic = "force-dynamic";

/**
 * One dashboard for everyone given TalentOS: "My day" (the person's own summary) for everyone, plus the workforce numbers of the people their scope covers
 * (a manager's reporting line, or the whole company). The old "Me" home forwards here.
 */
export default async function TalentosHome({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; dateFrom?: string; dateTo?: string; granularity?: string }> }) {
  const g = await hrPage("dashboard.view", "Dashboard");
  if (!g.user) return g.locked;
  const user = g.user;
  const sp = await searchParams;
  const reach = await hrReach(user, "dashboard");
  const workforce = reach.scope === "team" || reach.scope === "all";
  const mine = user.employeeId ?? null;
  const tabs = [...(mine ? ["mine"] : []), ...(workforce ? ["workforce"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : workforce ? "workforce" : "mine";

  return (
    <div className="p-1">
      <Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          ...(mine ? [{ key: "mine", label: "My day", content: <MyDashboard employeeId={mine} /> }] : []),
          ...(workforce ? [{
            key: "workforce",
            label: reach.scope === "all" ? "Workforce" : "My team",
            content: <WorkforceDashboard searchParams={sp} user={user} company={reach.scope === "all"} restrictToManagerId={reach.scope === "all" ? undefined : user.employeeId ?? "__none__"} />,
          }] : []),
        ]}
      />
    </div>
  );
}
