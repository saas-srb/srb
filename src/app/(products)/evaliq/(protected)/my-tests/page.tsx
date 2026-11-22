import { redirect } from "next/navigation";

/** The old "My Tests" address: the same Assigned Tests page everyone uses (it shows the person's own tests when they do not have everyone's scope). */
export default function MyTestsRedirect() {
  redirect("/evaliq/assignments?mine=1");
}
