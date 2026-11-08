import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { exportConversations } from "@/lib/chat-conversations";
import { toCsv } from "@/lib/csv";

function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handleGET(req: NextRequest) {
  const lmsUser = await requireLms("EXPORT_DATA");
  if (!lmsUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const idsParam = sp.get("ids");

  const rows = await exportConversations({
    search: sp.get("search") ?? undefined,
    device: sp.get("device") ?? undefined,
    sourcePage: sp.get("sourcePage") ?? undefined,
    dateFrom: parseDateParam(sp.get("dateFrom")),
    dateTo: parseDateParam(sp.get("dateTo"), true),
    ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
  });

  const csv = toCsv(rows, [
    { header: "Session ID", value: (r) => r.sessionId },
    { header: "Visitor ID", value: (r) => r.visitorId },
    { header: "Visitor Name", value: (r) => r.visitorName },
    { header: "Visitor Email", value: (r) => r.visitorEmail },
    { header: "Visitor Phone", value: (r) => r.visitorPhone },
    { header: "Main Service", value: (r) => r.visitorService },
    { header: "Device", value: (r) => r.device },
    { header: "Browser", value: (r) => r.browser },
    { header: "OS", value: (r) => r.os },
    { header: "Source Page", value: (r) => r.sourcePage },
    { header: "Conversation Started", value: (r) => r.startedAt },
    { header: "Role", value: (r) => r.role },
    { header: "Message", value: (r) => r.message },
    { header: "Sources", value: (r) => r.citations },
    { header: "Response Time (ms)", value: (r) => r.responseTimeMs },
    { header: "Sent At", value: (r) => r.sentAt },
  ]);

  const filename = `chat-conversations-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
