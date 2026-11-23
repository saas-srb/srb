import { redirect } from "next/navigation";

// The old My ... address now forwards to the normal page.
export default function OldPaymentsRedirect() {
  redirect("/cohort-ai/payments");
}
