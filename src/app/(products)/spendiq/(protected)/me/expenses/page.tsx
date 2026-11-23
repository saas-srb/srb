import { redirect } from "next/navigation";

// The old My expenses address now forwards to the normal page.
export default function OldExpensesRedirect() {
  redirect("/spendiq/expenses");
}
