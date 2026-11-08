import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { getCompanySecurity } from "@/lib/products/commandos/company";
import { formatDateTime } from "@/lib/utils";
import SecuritySections from "./SecuritySections";
import { recentBlockedUploads } from "@/lib/storage/upload-scan";
import { ObjectId } from "mongodb";

export const metadata: Metadata = { title: "Security", robots: { index: false, follow: false } };

const linkClass = "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-primary/40 hover:text-primary";

/** Sign-in security from the data that exists: last sign-in, password, sessions, accounts needing attention. */
export default async function SecurityPage() {
  const user = await requireWorkspaceAccess("company.security");
  const s = await getCompanySecurity(user.id);
  const blocked = await recentBlockedUploads().catch(() => []);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Security" }]}
          title={<>Security</>}
        />
<div className="space-y-4">

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Your sign-in</CardTitle>
            <CardDescription>Signed in as {user.email}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p id="security-last-signin">{user.lastLoginAt ? `Last sign-in: ${formatDateTime(user.lastLoginAt.toISOString())}` : "This is your first sign-in."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/commandos/change-password" className={linkClass}>
                Change password <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardContent>
        </GlassCard>

        <SecuritySections adminId={new ObjectId(user.id)} email={user.email} />

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Upload safety check</CardTitle>
            <CardDescription>Every file uploaded in any product is checked before it is stored. Programs, scripts, documents with macros, web pages, scripted images, archives that hold them and the standard antivirus test file are refused, with the reason shown to the person. Kept for 180 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upload has been refused.</p>
            ) : (
              <ul className="divide-y divide-border/50 text-sm" aria-label="Refused uploads">
                {blocked.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>{b.reason} <span className="text-xs text-muted-foreground">({b.folder})</span></span>
                    <time className="text-xs text-muted-foreground" dateTime={b.at.toISOString()} suppressHydrationWarning>{formatDateTime(b.at.toISOString())}</time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Your company&apos;s accounts</CardTitle>
            <CardDescription>Accounts lock for 15 minutes after 5 failed sign-ins. Passwords are at least 10 characters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl id="security-accounts" className="grid gap-3 sm:grid-cols-4">
              {[
                ["Active accounts", s.accounts],
                ["Directors", s.superAdmins],
                ["Must change password", s.mustChangePassword],
                ["Locked right now", s.locked],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/60 p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Link href="/commandos/users" className={linkClass}>
                Manage users and reset passwords <ArrowRight className="size-3.5" />
              </Link>
              <Link href="/commandos/settings/audit-log" className={linkClass}>
                Audit log <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
