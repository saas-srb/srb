import { redirect } from "next/navigation";
import { getCurrentSopUser } from "@/lib/sop-auth";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { workspaceLoginUrl } from "@/lib/workspace-session";

/**
 * There is one company sign-in: the Workspace. This address stays so old
 * links, bookmarks and the product's own "signed out" redirects keep working.
 */
export default async function SopLoginPage() {
  const user = await getCurrentSopUser();
  if (user) redirect("/playbook-ai");
  // Signed in, but this product isn't among the account's roles: back to the Workspace rather than a sign-in loop.
  if (await getCurrentHubUser()) redirect("/commandos");
  redirect(workspaceLoginUrl("/playbook-ai"));
}
