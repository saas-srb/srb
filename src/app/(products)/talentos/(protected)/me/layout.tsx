import { redirect } from "next/navigation";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { getEmployee } from "@/lib/products/talentos/employees";

/**
 * Employee self-service pages (`/talentos/me/*`). Open to any signed-in HRMS user
 * who is linked to an employee record — an employee-only account, or a manager /
 * HR / super-admin who also has an `employeeId`. The shared shell + session
 * check live in the parent `(protected)` layout.
 */
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos/login");
  if (!user.employeeId) redirect("/talentos/login");
  const employee = await getEmployee(user.employeeId);
  if (!employee) redirect("/talentos/login");
  return <>{children}</>;
}
