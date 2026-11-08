import { redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import ChangePasswordForm from "@/components/products/huddle-ai/ChangePasswordForm";
import { BrandName } from "@/components/platform/BrandProvider";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("Change password · {brand} {product:messenger}", { robots: { index: false } });

export default async function ChangePasswordPage() {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground">Messenger</span>
      </div>
      <div className="w-full max-w-sm">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </div>
  );
}
