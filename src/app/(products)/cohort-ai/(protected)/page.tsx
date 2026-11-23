import Tabs from "@/components/products/talentos/Tabs";
import MyDashboard from "@/components/products/cohort-ai/MyDashboard";
import TrainingDashboard from "@/components/products/cohort-ai/TrainingDashboard";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsCan } from "@/lib/tms-access";

export const dynamic = "force-dynamic";

/**
 * One dashboard for everyone given CohortAI: "My learning" (a student's own program, batch and progress) for people with a student record,
 * plus the institute numbers for the staff tier. The old "Me" home forwards here.
 */
export default async function CohortAiHome({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; dateFrom?: string; dateTo?: string; granularity?: string; programId?: string; mode?: string }> }) {
  const user = await getCurrentTmsUser();
  if (!user) return null;
  if (!tmsCan(user, "dashboard.view")) return <ProductLocked product="cohort-ai" feature="Dashboard" />;
  const sp = await searchParams;
  const staff = tmsCan(user, "dashboard.all");
  const mine = Boolean(user.studentId);
  const tab = staff && (sp.tab !== "mine" || !mine) ? "training" : "mine";
  return (
    <Tabs
      initial={tab}
      syncParam="tab"
      tabs={[
        ...(mine ? [{ key: "mine", label: "My learning", content: <MyDashboard /> }] : []),
        ...(staff ? [{ key: "training", label: "Training", content: <TrainingDashboard searchParams={searchParams} /> }] : []),
      ]}
    />
  );
}
