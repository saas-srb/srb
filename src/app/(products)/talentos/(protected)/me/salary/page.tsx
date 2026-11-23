import { redirect } from "next/navigation";

// "My Salary" is now part of the normal Payroll page (the "My pay" tab). The old address still works.
export default function MySalaryRedirect() {
  redirect("/talentos/payroll?tab=mine");
}
