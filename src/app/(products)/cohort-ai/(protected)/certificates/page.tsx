import StaffView from "./staff-view";
import MyCertificates from "@/components/products/cohort-ai/MyCertificates";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { tmsSeesAll } from "@/lib/tms-access";

// One page for everyone: the staff tier sees everyone's records; a student sees their own.
export default async function CertificatesPage(props: Record<string, unknown>) {
  const user = await getCurrentTmsUser();
  if (user && tmsSeesAll(user, "certificates")) return (StaffView as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return <MyCertificates />;
}
