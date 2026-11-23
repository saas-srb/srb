import StaffView from "./staff-view";
import MyProfile from "@/components/products/cohort-ai/MyProfile";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsSeesAll } from "@/lib/tms-access";

// One page for everyone: the staff tier sees everyone's records; a student sees their own.
export default async function StudentsPage(props: Record<string, unknown>) {
  const user = await getCurrentTmsUser();
  if (user && tmsSeesAll(user, "students")) return (StaffView as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return <MyProfile />;
}
