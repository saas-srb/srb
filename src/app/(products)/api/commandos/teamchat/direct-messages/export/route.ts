import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportDirectConversations } from "@/lib/products/commandos/teamchat";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.teamchat.direct-messages");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const rows = await exportDirectConversations({ search: sp.get("search") ?? undefined });

  const csv = toCsv(rows, [
    { header: "Participant A", value: (r) => r.participantA },
    { header: "Participant B", value: (r) => r.participantB },
    { header: "Last Message Preview", value: (r) => r.lastMessagePreview ?? "" },
    { header: "Last Message At", value: (r) => r.lastMessageAt },
    { header: "Started", value: (r) => r.createdAt },
  ]);

  const filename = `admin-teamchat-dms-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
