"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { enqueueBuild } from "@/lib/apps/enqueue";
import { isAppPlatform, PLATFORM_META, type AppPlatform } from "@/lib/apps/types";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
}

/**
 * The Generate button of ONE platform (Generate Android App, Generate iOS App, Generate Windows App …). This is the only way an app
 * is ever built: nothing runs on its own. Directors only.
 */
export async function buildAppAction(platform: AppPlatform): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireOwner();
  if (!isAppPlatform(platform)) return { ok: false, error: "Unknown app." };
  const res = await enqueueBuild(await currentCompanyId(), "manual", { force: true, scope: platform });
  revalidatePath("/commandos/settings/apps");
  const label = PLATFORM_META[platform].label;
  if (res.ok) return { ok: true, message: `Generating your ${label} app. This usually takes 10 to 20 minutes, and this page updates by itself.` };
  return res.reason === "in-progress" ? { ok: true, message: `Your ${label} app is already being generated.` } : { ok: false, error: res.message };
}
