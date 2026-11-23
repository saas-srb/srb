import StaffView from "./staff-view";
import MyProgram from "@/components/products/cohort-ai/MyProgram";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsSeesAll } from "@/lib/tms-access";

// One page for everyone: the staff tier sees everyone's records; a student sees their own.
export default async function ProgramsPage(props: Record<string, unknown>) {
  const user = await getCurrentTmsUser();
  if (user && tmsSeesAll(user, "programs")) return (StaffView as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return <MyProgram />;
}
