import StaffView from "./staff-view";
import MySchedule from "@/components/products/cohort-ai/MySchedule";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsSeesAll } from "@/lib/tms-access";

// One page for everyone: the staff tier sees everyone's records; a student sees their own.
export default async function ClassesPage(props: Record<string, unknown>) {
  const user = await getCurrentTmsUser();
  if (user && tmsSeesAll(user, "classes")) return (StaffView as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return <MySchedule />;
}
