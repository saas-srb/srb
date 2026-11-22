import { redirect } from "next/navigation";

// "My requests" is now the normal Requests page (it shows the person's own requests first). The old address still works.
export default function MyRequestsRedirect() {
  redirect("/talentos/requests");
}
