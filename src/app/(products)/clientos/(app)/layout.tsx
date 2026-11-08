import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { listPortalNotifications, portalUnreadCount } from "@/lib/products/clientos/notifications";
import { listPortalLeadSummaries } from "@/lib/products/clientos/lead";
import { recordDailyVisit } from "@/lib/wallet/earn";
import PortalSidebarShell from "@/components/products/clientos/PortalSidebarShell";
import PortalTopbar from "@/components/products/clientos/PortalTopbar";
import TempPasswordBanner from "@/components/products/clientos/TempPasswordBanner";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";

export const generateMetadata = () => brandedMetadata("{brand} {product:portal}", { robots: { index: false, follow: false } });

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  await requireModule("portal");
  const user = await getCurrentPortalUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/clientos/change-password");

  await recordDailyVisit(user); // daily-visit + streak credits (first load of the day only)

  const [notifications, unread, leads] = await Promise.all([
    listPortalNotifications(user.id, 10),
    portalUnreadCount(user.id),
    listPortalLeadSummaries(user),
  ]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="lms-shell relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <PortalSidebarShell role={user.role} displayName={user.displayName} email={user.email} />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <PortalTopbar
                role={user.role}
                displayName={user.displayName}
                unread={unread}
                leads={leads}
                notifications={notifications.map((n) => ({
                  _id: n._id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  link: n.link,
                  createdAt: n.createdAt.toISOString(),
                  read: n.read,
                }))}
              />
            </div>
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">
              <TempPasswordBanner />
              {children}
            </main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
