import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Lock, MailCheck, Users } from "lucide-react";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getEmailLapse, unverifiedDirectors } from "@/lib/platform/email-lapse";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { VERIFY_WINDOW_DAYS } from "@/lib/platform/email-lapse-rule";
import { hubLogoutAction } from "../(protected)/actions";
import VerifyRequiredPanel from "./VerifyRequiredPanel";

export const metadata: Metadata = { title: "Verify your email to continue", robots: { index: false, follow: false } };

const mask = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
};

/** Where everyone lands when the company's 30 days to verify its email ran out: what is on hold, why, and how to lift it. */
export default async function VerifyRequiredPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const lapse = await getEmailLapse();
  if (!lapse.lapsed) redirect("/commandos");
  const [company, directors] = await Promise.all([getCompany(await currentCompanyId()), unverifiedDirectors()]);
  const own = user.emailVerified === false;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent blur-3xl" />
      <main className="relative w-full max-w-xl">
        <div className="rounded-3xl border border-border/60 bg-card/80 p-7 shadow-xl shadow-primary/5 backdrop-blur sm:p-9">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Lock className="size-8" />
          </div>
          <h1 className="text-center text-2xl font-black tracking-tight">{company?.name ?? "Your workspace"} is on hold</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            The email for this account wasn&apos;t verified within {VERIFY_WINDOW_DAYS} days of registration, so access is paused. Nothing has been deleted — verify the email and everything is back at once.
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
                <b>What&apos;s safe:</b> all your data, people, settings and subscription are exactly as you left them.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b>Who can fix it:</b> {directors.length ? <>the Director to verify {directors.map((d) => mask(d.email)).join(", ")}</> : "a Director"}.
                {own ? " That is you — one click below." : " You can send them the link from here."}
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b>Signed in as:</b> {user.email}
              </span>
            </p>
          </div>

          <VerifyRequiredPanel own={own} />

          <form action={hubLogoutAction} className="mt-5 text-center">
            <button type="submit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
