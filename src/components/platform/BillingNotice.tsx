import { unstable_rethrow } from "next/navigation";
import { getBillingNotice, type BillingNoticeInfo } from "@/lib/platform/billing/enforce";
import BillingNoticePill from "@/components/platform/BillingNoticePill";
import { isStripDismissedServer } from "@/lib/platform/strip-dismiss-server";

export default async function BillingNotice({ className }: { className?: string }) {
  if (await isStripDismissedServer("billing-notice")) {
    return null;
  }

  let notice: BillingNoticeInfo | null = null;
  try {
    notice = await getBillingNotice();
  } catch (err) {
    // Re-throw Next's own control flow (dynamic bailout, notFound) untouched.
    unstable_rethrow(err);
    console.error("[billing] notice lookup failed", err);
  }
  if (!notice) return null;

  return <BillingNoticePill notice={notice} className={className} />;
}
