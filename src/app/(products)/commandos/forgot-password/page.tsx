import BrandMark from "@/components/BrandMark";
import { PanelName } from "@/components/platform/PanelsProvider";
import { BrandName } from "@/components/platform/BrandProvider";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground"><PanelName panel="workspace" fallback="Workspace" /></span>
      </div>
      <div className="w-full max-w-sm"><ForgotPasswordForm /></div>
    </div>
  );
}
