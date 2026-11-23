import { redirect } from "next/navigation";

// The old My requisitions address now forwards to the normal page.
export default function OldRequisitionsRedirect() {
  redirect("/spendiq/requisitions");
}
