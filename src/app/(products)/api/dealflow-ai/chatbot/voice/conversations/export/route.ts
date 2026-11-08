import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { exportVoiceConversations } from "@/lib/voice-conversations";
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
  const rows = await exportVoiceConversations({
    search: sp.get("search") ?? undefined,
    device: sp.get("device") ?? undefined,
    minDurationMs: Number(sp.get("minDuration")) * 1000 || undefined,
    dateFrom: parseDateParam(sp.get("dateFrom")),
    dateTo: parseDateParam(sp.get("dateTo"), true),
    ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
  });

  const csv = toCsv(rows, [
    { header: "Session ID", value: (r) => r.sessionId },
    { header: "Visitor ID", value: (r) => r.visitorId },
    { header: "Conversation Started", value: (r) => r.startedAt },
    { header: "Role", value: (r) => r.role },
    { header: "Text", value: (r) => r.text },
    { header: "Audio (s)", value: (r) => r.audioSeconds },
    { header: "Sent At", value: (r) => r.sentAt },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voice-conversations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

export const GET = withTransport(handleGET);
