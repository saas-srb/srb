"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { checkDnsAuthorityAction, copyDnsAction } from "./actions";
import type { PlatformHostsOverview } from "@/lib/platform/domains/sync/run";

/** The platform's own hosts (from SAAS_HOSTS), their status, where the root domain's DNS lives, and the DNS copy tool. */
export default function PlatformHostsPanel({ data, canManage }: { data: PlatformHostsOverview; canManage: boolean }) {
  const [auth, setAuth] = useState<{ where: string; next: string } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mark = (ok: boolean) => (ok ? "yes" : "no");
  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-3 py-4">
        <div>
          <h2 className="text-base font-bold">Platform hosts</h2>
          <p className="text-sm text-muted-foreground">Worked out from SAAS_HOSTS and attached to this project by Domain sync. The bare domain redirects to www.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Host</th><th className="pr-3">Role</th><th className="pr-3">Attached</th><th className="pr-3">Verified</th><th className="pr-3">DNS ok</th><th>Note</th></tr>
            </thead>
            <tbody>
              {data.hosts.map((h) => (
                <tr key={h.host} className="border-t">
                  <td className="py-1 pr-3 font-mono">{h.host}</td>
                  <td className="pr-3">{h.role}{h.redirectTo ? ` → ${h.redirectTo}` : ""}</td>
                  <td className="pr-3">{mark(h.attached)}</td>
                  <td className="pr-3">{mark(h.verified)}</td>
                  <td className="pr-3">{mark(h.dnsConfigured)}</td>
                  <td className="break-words text-xs text-muted-foreground">{h.error ?? (h.checkedAt ? "" : "not synced yet")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await checkDnsAuthorityAction(); if (r.ok) setAuth({ where: r.where, next: r.next }); else toast.error(r.error); })}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : `Where is ${data.root}'s DNS?`}
          </Button>
          {canManage && data.previousConfigured && (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await copyDnsAction(true); if (r.ok) setReport(`Dry run: ${r.report.source} records in the old zone, ${r.report.wouldCreate} would be created here, ${r.report.skipped} skipped.`); else toast.error(r.error); })}>
                Copy DNS records (dry run)
              </Button>
              <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await copyDnsAction(false); if (r.ok) setReport(`Created ${r.report.created} record(s), skipped ${r.report.skipped}${r.report.failed.length ? `, ${r.report.failed.length} failed (${r.report.failed[0].error})` : ""}.`); else toast.error(r.error); })}>
                Copy DNS records to this account
              </Button>
            </>
          )}
        </div>
        {auth && <p className="text-sm"><span className="font-medium">{auth.where.replace("-", " ")}:</span> {auth.next}</p>}
        {report && <p className="text-sm text-muted-foreground">{report}</p>}
      </CardContent>
    </GlassCard>
  );
}
