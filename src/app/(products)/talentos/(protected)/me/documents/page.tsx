import { redirect } from "next/navigation";

// The old My documents address now forwards to the normal page.
export default function OldDocumentsRedirect() {
  redirect("/talentos/profile?tab=documents");
}
