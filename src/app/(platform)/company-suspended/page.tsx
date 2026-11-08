import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, Clock, Lock, ShieldAlert, XCircle } from "lucide-react";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import { resolveSuspendedHost } from "@/lib/platform/tenancy/companies";
import { latestRequestState } from "@/lib/platform/reactivation";
import { formatDate } from "@/lib/utils";
import ReactivationDialog from "./ReactivationDialog";

export const metadata: Metadata = { title: "Workspace suspended", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Shown (403) by the proxy at the address of a suspended company, in place of "No workspace here". Public on purpose: nobody can sign in
 * to a suspended workspace, so this is where its people learn what happened and ask to be switched back on.
 */
export default async function CompanySuspendedPage() {
  const company = await resolveSuspendedHost((await headers()).get("host"));
  const state = company ? await latestRequestState(company.companyId) : null;
  const name = company?.name ?? "This workspace";

  return (
    <main className="fixed inset-0 z-10 isolate flex overflow-y-auto bg-background px-4 py-10">
      <BrandBackdrop />
      <div className="m-auto w-full max-w-xl">
        <div className="rounded-3xl border border-border/60 bg-card/85 p-7 shadow-xl shadow-primary/5 backdrop-blur sm:p-9">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Lock className="size-8" />
          </div>
          <h1 className="text-center text-2xl font-black tracking-tight">{name} is suspended</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Access to this workspace has been paused{company?.suspendedAt ? ` since ${formatDate(company.suspendedAt)}` : ""}. Nothing has been deleted. If you believe this is a mistake, or the reason has been resolved, you can ask us to reactivate it.
          </p>

          <div className="mt-6 space-y-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
            <p className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                <b>What&apos;s paused:</b> sign-in, every product and the public website of this company, for everyone in it.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>
                <b>What&apos;s safe:</b> all data, people, settings and the subscription are kept exactly as they were.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b>How it works:</b> send a short request with a government ID. Our team reviews it and emails you the decision; if approved, access returns at once.
              </span>
            </p>
          </div>

          {state?.status === "pending" && (
            <p role="status" className="mt-5 flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <b>Request under review.</b> Reference {state.reference}, sent {formatDate(state.createdAt)}. We&apos;ll email you as soon as there is a decision.
              </span>
            </p>
          )}
          {state?.status === "rejected" && (
            <p role="status" className="mt-5 flex items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <b>Your last request ({state.reference}) was not approved.</b>
                {state.reason ? <> Reason: {state.reason}</> : null} You can send a new request once this is addressed.
              </span>
            </p>
          )}

          {company && state?.status !== "pending" && <ReactivationDialog companyName={company.name} again={state?.status === "rejected"} />}
        </div>
      </div>
    </main>
  );
}
