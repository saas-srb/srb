import { redirect } from "next/navigation";
import { getCurrentLpmsUser } from "@/lib/lpms-auth";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { workspaceLoginUrl } from "@/lib/workspace-session";

/**
 * There is one company sign-in: the Workspace. This address stays so old
 * links, bookmarks and the product's own "signed out" redirects keep working.
 */
export default async function LpmsLoginPage() {
  const user = await getCurrentLpmsUser();
  if (user) redirect("/contractflow-ai");
  // Signed in, but this product isn't among the account's roles: back to the Workspace.
  if (await getCurrentHubUser()) redirect("/commandos");
  redirect(workspaceLoginUrl("/contractflow-ai"));
}
