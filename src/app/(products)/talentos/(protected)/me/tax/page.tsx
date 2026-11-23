import { redirect } from "next/navigation";

// "My Tax" is now under Payroll. The old address still works.
export default function MyTaxRedirect() {
  redirect("/talentos/payroll/tax");
}
