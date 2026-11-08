import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { hasOtsAccess } from "@/lib/ots-roles";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listOtsNotifications } from "@/lib/products/evaliq/notifications";
import { maybeSweep } from "@/lib/products/evaliq/sweep";
import { ensureOtsIndexes } from "@/lib/products/evaliq/db";
import { navCounts } from "@/lib/products/evaliq/page-data";
import OtsSidebarShell from "@/components/products/evaliq/OtsSidebarShell";
import OtsTopbar from "@/components/products/evaliq/OtsTopbar";
import type { OtsNavFlags } from "@/components/products/evaliq/OtsSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export const generateMetadata = () => brandedMetadata("{brand} {product:ots}", { robots: { index: false, follow: false } });

export default async function ProtectedOtsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("ots");
  const user = await getCurrentOtsUser();
  if (!user) redirect("/evaliq/login");
  if (user.mustChangePassword) redirect("/evaliq/change-password");
  if (!hasOtsAccess(user.roles)) redirect("/evaliq/login");
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");

  // Timeouts, expiry and reminders keep working on a once-a-day cron plan (throttled to every 5 min).
  await afterForCompany(async () => {
    await ensureOtsIndexes();
    await maybeSweep();
  });

  const [bell, counts] = await Promise.all([listOtsNotifications(viewer.userId), navCounts(viewer)]);
  const flags: OtsNavFlags = {
    dashboard: can(viewer, "VIEW_REPORTS") || can(viewer, "VIEW_TESTS"),
    tests: can(viewer, "VIEW_TESTS"),
    questions: can(viewer, "VIEW_QUESTIONS"),
    assignments: can(viewer, "VIEW_ASSIGNMENTS"),
    results: can(viewer, "VIEW_REPORTS") || can(viewer, "EVALUATE_ANSWERS"),
    reports: can(viewer, "VIEW_REPORTS"),
    analytics: can(viewer, "VIEW_REPORTS"),
    categories: can(viewer, "MANAGE_SETTINGS"),
    audit: can(viewer, "VIEW_AUDIT_LOG"),
    settings: can(viewer, "MANAGE_SETTINGS"),
    takeTests: can(viewer, "TAKE_TEST"),
    myResults: can(viewer, "TAKE_TEST") && can(viewer, "VIEW_RESULTS"),
    certificates: can(viewer, "VIEW_CERTIFICATES") || can(viewer, "VERIFY_CERTIFICATE") || can(viewer, "REVOKE_CERTIFICATE"),
    myOpen: counts.myOpen,
    toEvaluate: counts.toEvaluate,
  };

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>
          <OtsSidebarShell email={user.email} roles={user.roles} flags={flags} createdAt={user.createdAt.toISOString()} lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null} />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <OtsTopbar roles={user.roles} flags={flags} notifications={bell.items} unread={bell.unread} />
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
