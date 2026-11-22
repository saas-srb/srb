import { redirect } from "next/navigation";

// The "My Leave" page is now the normal Leave page (it shows the person's own leave first). The old address still works.
export default function MyLeaveRedirect() {
  redirect("/talentos/leave");
}
