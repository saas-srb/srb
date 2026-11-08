import { redirect } from "next/navigation";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { hasTmsStaffRole } from "@/lib/tms-roles";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { workspaceLoginUrl } from "@/lib/workspace-session";

/**
 * There is one company sign-in: the Workspace. This address stays so old
 * links, bookmarks and the product's own "signed out" redirects keep working.
 */
export default async function TmsLoginPage() {
  const user = await getCurrentTmsUser();
  if (user) redirect(hasTmsStaffRole(user.roles) ? "/cohort-ai" : "/cohort-ai/me");
  // Signed in, but this product isn't among the account's roles: back to the Workspace rather than a sign-in loop.
  if (await getCurrentHubUser()) redirect("/commandos");
  redirect(workspaceLoginUrl("/cohort-ai"));
}
