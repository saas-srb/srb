import { redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { getCurrentSmmsUser } from "@/lib/smms-auth";
import ChangePasswordForm from "@/components/products/viralpulse-ai/ChangePasswordForm";
import { BrandName } from "@/components/platform/BrandProvider";

export default async function ChangePasswordPage() {
  const user = await getCurrentSmmsUser();
  if (!user) redirect("/viralpulse-ai/login");

  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground">ViralPulse</span>
      </div>
      <div className="w-full max-w-sm">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </div>
  );
}
