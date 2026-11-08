import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentSmmsUser } from "@/lib/smms-auth";
import { hasSmmsAccess } from "@/lib/smms-roles";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { listSmmsNotifications } from "@/lib/products/viralpulse-ai/notifications";
import { getNavBadges } from "@/lib/products/viralpulse-ai/nav-badges";
import SmmsSidebarShell from "@/components/products/viralpulse-ai/SmmsSidebarShell";
import SmmsTopbar from "@/components/products/viralpulse-ai/SmmsTopbar";
import type { SmmsNavFlags } from "@/components/products/viralpulse-ai/SmmsSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export const generateMetadata = () => brandedMetadata("{brand} {product:smms}", { robots: { index: false, follow: false } });

export default async function ProtectedSmmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("smms");
  const user = await getCurrentSmmsUser();
  if (!user) redirect("/viralpulse-ai/login");
  if (user.mustChangePassword) redirect("/viralpulse-ai/change-password");
  if (!hasSmmsAccess(user.roles)) redirect("/viralpulse-ai/login");
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");

  const bell = await listSmmsNotifications(viewer.userId);
  const flags: SmmsNavFlags = {
    campaigns: can(viewer, "VIEW_CAMPAIGNS"),
    posts: can(viewer, "MANAGE_POSTS") || can(viewer, "VIEW_CAMPAIGNS"),
    media: can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS") || can(viewer, "CREATE_ADS"),
    ai: can(viewer, "GENERATE_AI_CONTENT"),
    ugc: can(viewer, "GENERATE_AI_CONTENT"),
    analytics: can(viewer, "VIEW_ANALYTICS"),
    audit: can(viewer, "VIEW_AUDIT_LOG"),
    settings: can(viewer, "MANAGE_INTEGRATIONS"),
  };

  const badges = await getNavBadges(flags);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>
          <SmmsSidebarShell email={user.email} roles={user.roles} flags={flags} badges={badges} createdAt={user.createdAt.toISOString()} lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null} />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <SmmsTopbar roles={user.roles} flags={flags} badges={badges} notifications={bell.items} unread={bell.unread} />
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
