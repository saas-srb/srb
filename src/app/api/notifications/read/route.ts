import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { currentNotifyViewer } from "@/lib/notify/viewer";
import { markPanelRead } from "@/lib/notify";
import { isNotifyPanel } from "@/lib/notify/panels";
import { hasLevel } from "@/lib/ai/agent/access";

const UNIFIED = new Set(["fms", "lms", "lpms", "cms", "intelligence", "support"]);

/** Marks the person's OWN notifications of one product as read (the shared-store products). Ids that are not theirs simply don't match. */
async function handlePOST(req: NextRequest) {
  const v = await currentNotifyViewer(null);
  if (!v || v.actor !== "staff") return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { panel?: unknown; ids?: unknown };
  if (!isNotifyPanel(body.panel) || !UNIFIED.has(body.panel)) return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  if (body.panel !== "support" && !hasLevel(v.user.roles, body.panel, "any")) return NextResponse.json({ error: "No access." }, { status: 403 });
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : undefined;
  await markPanelRead(v.user.id, body.panel, ids);
  return NextResponse.json({ ok: true });
}

export const POST = withTransport(handlePOST);
