import { twoStepGate } from "@/lib/security/two-step-gate";
import { panelUnread } from "@/lib/notify";
import { runLmsSweep } from "@/lib/notify/sweeps";
import { redirect } from "next/navigation";
import { getCurrentLmsUser } from "@/lib/lms-auth";
import { hasLmsAccess, lmsCan, LMS_PERMISSIONS } from "@/lib/lms-roles";
import { LmsAccessProvider } from "@/components/products/dealflow-ai/LmsAccess";
import LmsSidebarShell from "@/components/products/dealflow-ai/LmsSidebarShell";
import LmsTopbar from "@/components/products/dealflow-ai/LmsTopbar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export default async function ProtectedLmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("lms");
  const lmsUser = await getCurrentLmsUser();
  if (!lmsUser) redirect("/dealflow-ai/login");
  // A staff account with no CRM role (HR, projects, finance …) has nothing to open here.
  if (!hasLmsAccess(lmsUser.roles)) redirect("/commandos");

  // Time-based alerts (stale leads / applications) become real notifications once a day; the bell counts what is unread for this person.
  await runLmsSweep().catch(() => {});
  const unread = await panelUnread(lmsUser.id, "lms").catch(() => 0);

  const allowed = LMS_PERMISSIONS.filter((p) => lmsCan(lmsUser, p));

  return (
    <LmsAccessProvider allowed={allowed}>
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          {/* `position: fixed` here used to escape this wrapper's own stacking
              context straight to the document root — where <body>'s own
              opaque `bg-background` paints ON TOP of it (a fixed + negative
              z-index element is promoted out of a non-stacking-context
              ancestor, so it stacks against the root, not against this div).
              `absolute` keeps it a normal child of this `relative` wrapper, so
              it paints right after the wrapper's own background and before
              the sidebar/topbar/main that follow it in the DOM — same visual
              result the Services page's ListingHero blobs get for free. */}
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <LmsSidebarShell
            userEmail={lmsUser.email}
            createdAt={lmsUser.createdAt.toISOString()}
            lastLoginAt={lmsUser.lastLoginAt ? lmsUser.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <LmsTopbar roles={lmsUser.roles} userEmail={lmsUser.email} unread={unread} />
            </div>
            {/* The fixed .lms-ambient layer above is positioned to this
                whole shell (not to main's scroll content), so it stays put
                behind every translucent product at any scroll depth — no
                per-page blobs needed on top of it. */}
            <PanelBackBar />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">{children}</main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
    </LmsAccessProvider>
  );
}
