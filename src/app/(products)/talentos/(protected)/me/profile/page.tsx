import { redirect } from "next/navigation";

// The old My profile address now forwards to the normal page.
export default function OldProfileRedirect() {
  redirect("/talentos/profile");
}
