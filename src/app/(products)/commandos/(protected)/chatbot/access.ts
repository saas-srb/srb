import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentHubUser, type CurrentHubUser } from "@/lib/hub-auth";
import { requireLms, requireLmsOrCms } from "@/lib/lms-auth";
import { MANAGE_PERMISSIONS } from "@/lib/products/commandos/nav";
import { checkWorkspaceAccess, requireWorkspaceAction } from "@/lib/products/commandos/access";
import { resolvePermission } from "@/lib/permission-overrides";

const CHATBOT_MANAGE_KEY = "manage.chatbot.conversations";

export async function requireChatbotViewAccess() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");
  if (await checkWorkspaceAccess(user, CHATBOT_MANAGE_KEY)) return user;
  redirect("/commandos");
}

export async function requireChatbotManageAction(): Promise<CurrentHubUser> {
  const user = await getCurrentHubUser();
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword) throw new Error("Forbidden");
  if (resolvePermission(user, MANAGE_PERMISSIONS.chatbot, () => false)) {
    return requireWorkspaceAction(CHATBOT_MANAGE_KEY);
  }
  if (!(await requireLmsOrCms("MANAGE_CHATBOT")) || !(await checkWorkspaceAccess(user, CHATBOT_MANAGE_KEY))) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function authorizeChatbotApi(
  capability: "view" | "manage" | "export"
): Promise<{ ok: true; email: string } | { ok: false; response: NextResponse }> {
  const user = await getCurrentHubUser();
  if (user?.mustChangePassword) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (user && resolvePermission(user, MANAGE_PERMISSIONS.chatbot, () => false)) {
    if (!(await checkWorkspaceAccess(user, CHATBOT_MANAGE_KEY))) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, email: user.email };
  }

  const productUser = capability === "export"
    ? await requireLms("EXPORT_DATA")
    : await requireLmsOrCms(capability === "manage" ? "MANAGE_CHATBOT" : "VIEW_CHATBOT");
  if (productUser && (!user || await checkWorkspaceAccess(user, CHATBOT_MANAGE_KEY))) {
    return { ok: true, email: productUser.email };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: user ? "Forbidden" : "Unauthorized" }, { status: user ? 403 : 401 }),
  };
}
