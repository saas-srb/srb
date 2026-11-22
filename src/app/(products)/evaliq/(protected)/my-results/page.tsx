import { redirect } from "next/navigation";

/** The old "My Results" address: the same Results page everyone uses (own results unless the person has everyone's scope; ?mine=1 forces own). */
export default function MyResultsRedirect() {
  redirect("/evaliq/results?mine=1");
}
