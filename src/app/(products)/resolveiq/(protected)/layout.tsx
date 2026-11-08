import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { countForCompany } from "@/lib/support/requests";
import { getCompanyCaller } from "@/lib/support/caller";
import { panelUnread } from "@/lib/notify";
import SupportSidebarShell from "@/components/support/SupportSidebarShell";
import SupportTopbar from "@/components/support/SupportTopbar";
import PanelBackBar from "@/components/hub/PanelBackBar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isPanelAvailable } from "@/lib/platform/panels/store";
import { notFound } from "next/navigation";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("{brand} {product:support}", { robots: { index: false, follow: false } });

/**
 * The Help & Support Center every company uses. There is no product-specific role or sign-in: any signed-in member of the
 * company (the Workspace session) can get help and send requests — the data itself is SelfRun AI's, see `lib/resolveiq`.
 */
export default async function ProtectedSupportLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  if (!(await isPanelAvailable(caller.companyId, "support"))) notFound();

  const [counts, unread] = await Promise.all([countForCompany(caller.companyId), panelUnread(user.id, "support").catch(() => 0)]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <SupportSidebarShell email={user.email} roles={user.roles} openRequests={counts.open + counts.waiting} createdAt={user.createdAt.toISOString()} lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null} />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <SupportTopbar openRequests={counts.open + counts.waiting} unread={unread} />
            </div>
            <PanelBackBar />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">{children}</main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
