import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { PanelName } from "@/components/platform/PanelsProvider";
import { BrandName } from "@/components/platform/BrandProvider";
import { resetTokenValid } from "@/lib/products/commandos/password-reset";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = String((await searchParams).token ?? "");
  const valid = await resetTokenValid(token).catch(() => false);
  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground"><PanelName panel="workspace" fallback="Workspace" /></span>
      </div>
      <div className="w-full max-w-sm">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm" role="alert">
            <h1 className="text-lg font-semibold">This link no longer works</h1>
            <p className="text-sm text-muted-foreground">Reset links work once and expire after 30 minutes. Ask for a new one.</p>
            <Link href="/commandos/forgot-password" className="text-sm font-medium text-primary hover:underline">Send me a new link</Link>
          </div>
        )}
      </div>
    </div>
  );
}
