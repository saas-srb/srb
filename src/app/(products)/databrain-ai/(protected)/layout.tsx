import { twoStepGate } from "@/lib/security/two-step-gate";
import { panelUnread } from "@/lib/notify";
import { redirect } from "next/navigation";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { intelligenceCan } from "@/lib/intelligence-roles";
import { listConversations } from "@/lib/products/databrain-ai/conversations";
import { buildCatalogView } from "@/lib/products/databrain-ai/catalog/view";
import { exampleQuestions } from "@/lib/products/databrain-ai/prompt";
import IntelligenceSidebarShell from "@/components/products/databrain-ai/IntelligenceSidebarShell";
import IntelligenceTopbar from "@/components/products/databrain-ai/IntelligenceTopbar";
import { IntelligenceProvider } from "@/components/products/databrain-ai/IntelligenceProvider";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export const generateMetadata = () => brandedMetadata("{brand} {product:intelligence}", { robots: { index: false, follow: false } });

export default async function ProtectedIntelligenceLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("intelligence");
  const user = await getCurrentIntelligenceUser();
  if (!user) redirect("/databrain-ai/login");
  if (user.mustChangePassword) redirect("/commandos/change-password");
  if (!intelligenceCan(user, "USE")) redirect("/databrain-ai/login");

  // The sidebar's examples come from what THIS user may actually query — nothing is hardcoded to a company.
  const [conversations, examples] = await Promise.all([
    listConversations(user.id),
    buildCatalogView(user).then((v) => exampleQuestions(v, 6)).catch(() => [] as string[]),
  ]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <IntelligenceProvider initial={conversations} examples={examples}>
          <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
            <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
              <div className="lms-ambient-mid" />
              <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
            </div>

            <IntelligenceSidebarShell email={user.email} roles={user.roles} createdAt={user.createdAt.toISOString()} lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null} />

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
                <IntelligenceTopbar roles={user.roles} unread={await panelUnread(user.id, "intelligence").catch(() => 0)} />
              </div>
              <PanelBackBar />
              <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">{children}</main>
            </div>
          </div>
        </IntelligenceProvider>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
