import { listPanels } from "@/lib/platform/panels/store";
import { PanelName } from "@/components/platform/PanelsProvider";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import BrandMark from "@/components/BrandMark";
import LoginForm from "./LoginForm";
import { safeNextPath } from "@/lib/workspace-session";
import { loginLanding } from "@/lib/platform/onboarding/state";
import { BrandName } from "@/components/platform/BrandProvider";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

export default async function HubLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; demo?: string; reset?: string; ended?: string }> }) {
  // The headline products come from the Product Registry (the first few active, non-core business products).
  const panelList = (await listPanels().catch(() => [])).filter((p) => p.active && !p.core && !(["website", "support", "portal"] as string[]).includes(p.key)).slice(0, 5).map((p) => whiteLabelProductName(p.name)).join(", ");
  // Where to go after sign-in: only a same-origin path survives `safeNextPath` (no open redirect).
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const isDemo = sp.demo === "1";
  const user = await getCurrentHubUser();
  if (user) redirect(user.mustChangePassword ? "/commandos/change-password" : await loginLanding(user.roles, next));

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[20%] -left-[10%] h-[60%] w-[60%] rounded-full bg-primary/15 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
          <div className="absolute top-[10%] right-[5%] h-[50%] w-[50%] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
          <div className="absolute -bottom-[20%] left-[20%] h-[70%] w-[70%] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000" />
          <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>

        <div className="relative z-10 flex items-center gap-2 text-lg font-bold">
          <BrandMark className="size-7 shrink-0" />
          <BrandName /> <span className="text-foreground"><PanelName panel="workspace" fallback="Workspace" /></span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            One login,{" "}
            <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">every product you need.</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Sign in once and reach {panelList} and more — only the products
            your role gives you access to, no separate login for each one.
          </p>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground">Access is logged and rate-limited.</p>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">
        {sp.ended === "1" ? <p role="status" className="mb-4 w-full max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">You were signed out here. This happens when your account signs in on another device (the Free plan allows one device at a time) or the session expires.</p> : null}
        {sp.reset === "1" ? <p role="status" className="mb-4 w-full max-w-sm rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">Your password was changed. Sign in with the new one.</p> : null}
        <LoginForm next={next} demo={isDemo} />
      </div>
    </div>
  );
}
