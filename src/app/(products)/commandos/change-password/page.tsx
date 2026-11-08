import { PanelName } from "@/components/platform/PanelsProvider";
import { redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { getCurrentHubUser } from "@/lib/hub-auth";
import HubChangePasswordForm from "@/components/hub/HubChangePasswordForm";
import { BrandName } from "@/components/platform/BrandProvider";

export default async function HubChangePasswordPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");

  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground"><PanelName panel="workspace" fallback="Workspace" /></span>
      </div>
      <div className="w-full max-w-sm">
        <HubChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </div>
  );
}
