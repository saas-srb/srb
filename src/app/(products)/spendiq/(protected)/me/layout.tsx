import { redirect } from "next/navigation";
import { getCurrentPrmsUser } from "@/lib/prms-auth";

/**
 * Employee self-service portal (`/spendiq/me/*`). Any signed-in PRMS user can use
 * it — employees live here exclusively; staff see it alongside the full product.
 */
export default async function PortalPrmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPrmsUser();
  if (!user) redirect("/spendiq/login");
  return <>{children}</>;
}
