import Tabs from "@/components/products/talentos/Tabs";
import MyDashboard from "@/components/products/spendiq/MyDashboard";
import SpendDashboard from "@/components/products/spendiq/SpendDashboard";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan } from "@/lib/prms-access";

export const dynamic = "force-dynamic";

/**
 * One dashboard for everyone given SpendIQ: "My requests" (their own requisitions and claims), plus the company spend numbers for the staff tier.
 * The old "Me" home forwards here.
 */
export default async function SpendiqHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentPrmsUser();
  if (!user) return null;
  if (!prmsCan(user, "dashboard.view")) return <ProductLocked product="spendiq" feature="Dashboard" />;
  const sp = await searchParams;
  const spend = prmsCan(user, "dashboard.all");
  const tab = spend && sp.tab !== "mine" ? "spend" : "mine";
  return (
    <Tabs
      initial={tab}
      syncParam="tab"
      tabs={[
        { key: "mine", label: "My requests", content: <MyDashboard /> },
        ...(spend ? [{ key: "spend", label: "Spend", content: <SpendDashboard searchParams={searchParams} /> }] : []),
      ]}
    />
  );
}
