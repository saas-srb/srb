import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, CreditCard, Lock, Users } from "lucide-react";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getDb } from "@/lib/mongodb";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getTrialLocked } from "@/lib/platform/billing/trial-lock";
import { hubLogoutAction } from "../(protected)/actions";

export const metadata: Metadata = { title: "Subscribe to continue", robots: { index: false, follow: false } };

const mask = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
};

/** Where everyone lands when the free trial ended and no plan was bought: what is on hold, and how to lift it. */
export default async function SubscribeRequiredPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!(await getTrialLocked())) redirect("/commandos");
  const companyId = await currentCompanyId();
  const [company, sub, directors] = await Promise.all([
    getCompany(companyId),
    getCompanySubscription(companyId),
    getDb().then((db) => db.collection("admin_users").find({ $or: [{ designationId: "director" }, { roles: "super_admin" }] }, { projection: { email: 1 } }).limit(5).toArray()),
  ]);
  const isDirector = user.roles.includes("super_admin");
  const endedOn = sub?.trialEndsAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(sub.trialEndsAt) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-3xl" />
      <main className="relative w-full max-w-xl">
        <div className="rounded-3xl border border-border/60 bg-card/80 p-7 shadow-xl shadow-primary/5 backdrop-blur sm:p-9">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="size-8" />
          </div>
          <h1 className="text-center text-2xl font-black tracking-tight">Your free trial has ended</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            {company?.name ?? "This workspace"}&apos;s trial {endedOn ? `ended on ${endedOn}` : "has ended"} and no plan has been subscribed yet. Subscribe to a plan and everything opens again at once.
          </p>

          <div className="mt-6 space-y-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
            <p className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                <b>What&apos;s paused:</b> every product and page, for everyone in the company, and creating or changing any data. Sign-in still works so you can reach this page.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>
                <b>What&apos;s safe:</b> all your data, people and settings are exactly as you left them.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b>Who can fix it:</b> {directors.length ? <>the Director ({directors.map((d) => mask(String(d.email))).join(", ")})</> : "a Director"}.
                {isDirector ? " That is you." : " Ask them to subscribe a plan."}
              </span>
            </p>
          </div>

          {isDirector && (
            <Link href="/commandos/settings/billing" className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
              <CreditCard className="size-4" /> Choose a plan
            </Link>
          )}

          <form action={hubLogoutAction} className="mt-5 text-center">
            <button type="submit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
              Sign out ({user.email})
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
