import { redirect } from "next/navigation";
import { getCurrentLmsUser } from "@/lib/lms-auth";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { workspaceLoginUrl } from "@/lib/workspace-session";

/**
 * There is one company sign-in: the Workspace. This address stays so old
 * links, bookmarks and the product's own "signed out" redirects keep working.
 */
export default async function AdminLoginPage() {
  const lmsUser = await getCurrentLmsUser();
  if (lmsUser) redirect("/dealflow-ai");
  // Signed in, but this product isn't among the account's roles: back to the Workspace rather than a sign-in loop.
  if (await getCurrentHubUser()) redirect("/commandos");
  redirect(workspaceLoginUrl("/dealflow-ai"));
}
