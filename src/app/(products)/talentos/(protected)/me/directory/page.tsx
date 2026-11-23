import { redirect } from "next/navigation";

// The old My directory address now forwards to the normal page.
export default function OldDirectoryRedirect() {
  redirect("/talentos/directory");
}
