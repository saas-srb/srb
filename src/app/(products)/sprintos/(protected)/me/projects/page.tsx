import { redirect } from "next/navigation";

// The old My projects address now forwards to the normal page.
export default function OldProjectsRedirect() {
  redirect("/sprintos/projects");
}
