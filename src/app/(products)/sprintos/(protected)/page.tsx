import Tabs from "@/components/products/talentos/Tabs";
import MyDashboard from "@/components/products/sprintos/MyDashboard";
import ProjectDashboard from "@/components/products/sprintos/ProjectDashboard";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { pmsCan, pmsScope } from "@/lib/pms-access";
import ProductLocked from "@/components/products/common/ProductLocked";

export const dynamic = "force-dynamic";

/**
 * One dashboard for everyone given SprintOS: "My day" (their own projects, tasks and timesheet), plus the project numbers of the projects their scope covers
 * (their own projects for the staff tier, every project for the everyone's scope). The old "Me" home forwards here.
 */
export default async function SprintosHome({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; dateFrom?: string; dateTo?: string }> }) {
  const user = await getCurrentPmsUser();
  if (!user) return null;
  if (!pmsCan(user, "dashboard.view")) return <ProductLocked product="sprintos" feature="Dashboard" />;
  const sp = await searchParams;
  const projects = pmsScope(user, "dashboard") === "none" ? false : pmsCan(user, "dashboard.team") || pmsCan(user, "dashboard.all");
  const mine = Boolean(user.employeeId);
  const tabs = [...(mine ? ["mine"] : []), ...(projects ? ["projects"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : projects ? "projects" : "mine";
  return (
    <Tabs
      initial={tab}
      syncParam="tab"
      tabs={[
        ...(mine ? [{ key: "mine", label: "My day", content: <MyDashboard searchParams={searchParams} /> }] : []),
        ...(projects ? [{ key: "projects", label: "Projects", content: <ProjectDashboard searchParams={searchParams as never} /> }] : []),
      ]}
    />
  );
}
