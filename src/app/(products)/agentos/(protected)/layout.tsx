import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentAibotsUser } from "@/lib/aibots-auth";
import { hasAibotsAccess } from "@/lib/aibots-roles";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { listAibotsNotifications } from "@/lib/products/agentos/notifications";
import { listRecentAgents } from "@/lib/products/agentos/hub";
import AibotsSidebarShell from "@/components/products/agentos/AibotsSidebarShell";
import AibotsTopbar from "@/components/products/agentos/AibotsTopbar";
import type { AibotsNavFlags } from "@/components/products/agentos/AibotsSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export const generateMetadata = () => brandedMetadata("{brand} {product:aibots}", { robots: { index: false, follow: false } });

export default async function ProtectedAibotsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("aibots");
  const user = await getCurrentAibotsUser();
  if (!user) redirect("/agentos/login");
  if (user.mustChangePassword) redirect("/agentos/change-password");
  if (!hasAibotsAccess(user.roles)) redirect("/agentos/login");
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");

  // The sidebar lists only the agents this viewer has actually chatted or talked with, newest first.
  const [bell, recent] = await Promise.all([listAibotsNotifications(viewer.userId), listRecentAgents(viewer)]);
  const sidebarBots = recent.agents;
  const flags: AibotsNavFlags = {
    createBot: can(viewer, "CREATE_BOT"),
    manageBots: can(viewer, "EDIT_BOT") || can(viewer, "DELETE_BOT") || can(viewer, "MANAGE_KB"),
    allChats: can(viewer, "VIEW_CHATS"),
    audit: can(viewer, "VIEW_AUDIT"),
    settings: can(viewer, "MANAGE_SETTINGS"),
  };

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <AibotsSidebarShell
            email={user.email}
            roles={user.roles}
            flags={flags}
            bots={sidebarBots}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <AibotsTopbar roles={user.roles} flags={flags} bots={sidebarBots} notifications={bell.items} unread={bell.unread} />
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
