import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import Link from "next/link";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { formatDateTime } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { requestOrigin } from "@/lib/platform/request";
import { getRazorpayConfigView } from "@/lib/platform/billing/razorpay-config";
import { listWebhookEvents } from "@/lib/platform/billing/subscriptions";
import { formatMoney } from "@/lib/platform/billing/types";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import RazorpayConfigForm from "./RazorpayConfigForm";

export const metadata: Metadata = { title: "Payments & Razorpay" };

const STATUS_STYLE: Record<string, string> = {
  processed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  ignored: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/15 text-destructive",
};

export default async function PlatformPaymentsPage() {
  await requirePlatformPermission("payments.read");
  const [view, events, { origin }] = await Promise.all([getRazorpayConfigView(), listWebhookEvents(30), requestOrigin()]);
  const ids = [...new Set(events.map((e) => e.companyId).filter((id): id is string => Boolean(id)))];
  const names = new Map(
    ids.length
      ? (await (await getPlatformDb()).collection<{ _id: string; name: string }>(COMPANIES_COLLECTION).find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()).map((c) => [c._id, c.name])
      : [],
  );

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Payments & Razorpay"
        description="The Razorpay account that collects subscription payments from companies, its webhook, and recent payment events."
        crumbs={[{ label: "Billing" }]}
        actions={
          <Badge variant="outline" className={view.mode === "live" ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400" : ""}>
            {view.source === "none" ? "Not configured" : `${view.mode === "live" ? "Live" : "Test"} mode${view.source === "env" ? " · from env" : ""}`}
          </Badge>
        }
      />
      <PanelListFilters>
<RazorpayConfigForm view={view} webhookUrl={`${origin}/api/platform/billing/webhook`} />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Recent payments & webhook events</CardTitle>
          <CardDescription>The last {events.length || 30} deliveries from Razorpay. Each event is processed once; a redelivery is acknowledged without effect.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook events received yet.</p>
          ) : (
            <ul id="billing-webhook-events" className="divide-y divide-border text-sm">
              {events.map((e) => (
                <li key={e._id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium break-all">{e.event}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.receivedAt)}
                      {e.companyId && (
                        <>
                          {" · "}
                          <Link href={`/console/subscriptions/${e.companyId}`} className="hover:text-foreground hover:underline">
                            {names.get(e.companyId) ?? e.companyId}
                          </Link>
                        </>
                      )}
                      {e.paymentId && <span className="break-all"> · {e.paymentId}</span>}
                    </p>
                    {e.detail && <p className="text-xs break-words text-muted-foreground">{e.detail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {typeof e.amount === "number" && <span className="tabular-nums">{formatMoney(e.amount, e.currency?.toUpperCase() || "INR")}</span>}
                    <Badge className={STATUS_STYLE[e.status] ?? ""}>{e.status}</Badge>
                    {e.attempts > 1 && <Badge variant="outline">×{e.attempts}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
