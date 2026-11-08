import { NextRequest, NextResponse } from "next/server";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { listSubscriptions } from "@/lib/offers/subscriptions";
import { toCsv } from "@/lib/csv";

/** Route handlers aren't covered by the (protected) layout's guard, so this checks the LMS session itself. */
export async function GET(req: NextRequest) {
  const user = await requireLmsOrCms("EXPORT_DATA");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = req.nextUrl.searchParams.get("campaign") || undefined;
  const rows = await listSubscriptions({ campaignId: campaign, limit: 5000 });
  const csv = toCsv(rows, [
    { header: "Email", value: (r) => r.email },
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => r.phone },
    { header: "Interest", value: (r) => r.interest },
    { header: "Campaign", value: (r) => r.campaignId ?? "any" },
    { header: "Source", value: (r) => r.source },
    { header: "Message", value: (r) => r.message },
    { header: "Notified campaigns", value: (r) => r.notifiedCampaignIds.length },
    { header: "Joined", value: (r) => r.createdAt.toISOString() },
  ]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="offer-subscribers.csv"' } });
}
