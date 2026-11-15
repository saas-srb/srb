"use client";

import HubSidebar from "@/components/hub/HubSidebar";
import HrmsSidebar from "@/components/products/talentos/HrmsSidebar";
import LockedPage from "@/components/products/commandos/LockedPage";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NavSection } from "@/lib/products/commandos/nav";

/** Development-only (404 in production): the real sidebars and the locked page over sample access, no sign-in and no database. */
export default function ShellHarness({ view, nav, title }: { view: string; nav: NavSection[]; title: string }) {
  return (
    <TooltipProvider>
      <div className="mx-auto flex max-w-5xl gap-4 p-4">
        <aside className="w-64 shrink-0 rounded-3xl border border-border/50 bg-card/90">
          {view === "product" ? (
            <HrmsSidebar roles={["employee"]} employeeId="e1" />
          ) : (
            <HubSidebar nav={nav} />
          )}
        </aside>
        <main className="min-w-0 flex-1">
          <h1 className="mb-3 text-lg font-bold">{title}</h1>
          {view === "locked" ? (
            <LockedPage title="Plan & billing" area="Company settings" description="Your plan, payments, coupon codes and GST billing details." directors={[{ name: "Vijay Pal", email: "vijay@sample.test" }, { name: "Dee Rector", email: "dee@sample.test" }]} request={async () => ({ ok: true })} />
          ) : (
            <p className="text-sm text-muted-foreground">Same sidebar for everyone: what a person cannot use is greyed with a lock.</p>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
