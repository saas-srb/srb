import StaffView from "./staff-view";
import MyBatch from "@/components/products/cohort-ai/MyBatch";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsSeesAll } from "@/lib/tms-access";

// One page for everyone: the staff tier sees everyone's records; a student sees their own.
export default async function BatchesPage(props: Record<string, unknown>) {
  const user = await getCurrentTmsUser();
  if (user && tmsSeesAll(user, "batches")) return (StaffView as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return <MyBatch />;
}
