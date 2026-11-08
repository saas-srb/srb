import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { detectLanguage, say } from "@/lib/ai/policy";
import { limitOr429 } from "@/lib/security/rate-limit";
import { BillingLimitError } from "@/lib/platform/billing/enforce";
import { agentPlanState, currentAgentUser, hasLevel, PANEL_ROLES } from "@/lib/ai/agent/access";
import { decideProposal, runAgent } from "@/lib/ai/agent/engine";
import { MAX_ATTACHMENTS } from "@/lib/ai/agent/attachments";
import type { AgentUser, Attachment, ClientMessage } from "@/lib/ai/agent/types";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { getPlatformAccessForUser } from "@/lib/platform/console/roles";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";

export const maxDuration = 300;

const OPEN_PANELS = new Set(["hub", "workspace", "platform", "support", "portal"]);
const KINDS = new Set(["image", "pdf", "text", "doc"]);

function cleanMessages(raw: unknown): ClientMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientMessage[] = [];
  for (const m of raw.slice(-24)) {
    if (!m || typeof m !== "object") continue;
    const { role, content, attachments } = m as { role?: unknown; content?: unknown; attachments?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    const text = typeof content === "string" ? content.slice(0, 8000) : "";
    const files: Attachment[] = Array.isArray(attachments)
      ? attachments.slice(0, MAX_ATTACHMENTS).flatMap((a: unknown) => {
          const x = a as Partial<Attachment>;
          return x && typeof x.name === "string" && typeof x.data === "string" && typeof x.kind === "string" && KINDS.has(x.kind) ? [{ name: x.name.slice(0, 120), mime: String(x.mime ?? "").slice(0, 100), data: x.data, kind: x.kind } as Attachment] : [];
        })
      : [];
    if (!text.trim() && !files.length) continue;
    out.push({ role, content: text, ...(files.length ? { attachments: files } : {}) });
  }
  return out;
}

async function handlePOST(req: NextRequest) {
  const limited = await limitOr429(req, "ai-agent", 60, 600);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const lang = detectLanguage(cleanMessages(body.messages).filter((m) => m.role === "user").map((m) => m.content));
  const panel = typeof body.panel === "string" ? body.panel : "";
  if (!panel || (!OPEN_PANELS.has(panel) && !PANEL_ROLES[panel])) return NextResponse.json({ error: "Unknown product." }, { status: 400 });

  // The portal is for external people with their own sign-in (never a workspace account); every other product needs a workspace sign-in.
  let user: AgentUser | null;
  if (panel === "portal") {
    const p = await getCurrentPortalUser();
    user = p ? { id: `portal:${p.id}`, email: p.email, name: p.displayName, roles: [`portal_${p.role}`] } : null;
  } else {
    user = await currentAgentUser();
  }
  if (!user) return NextResponse.json({ error: say("signIn", lang) }, { status: 401 });

  if (panel !== "platform" && panel !== "portal") {
    const plan = await agentPlanState();
    user.blockedPanels = plan.blockedPanels;
    user.readOnly = plan.readOnly;
    if (plan.blockedPanels.includes(panel)) return NextResponse.json({ error: "This product isn't included in your plan. Upgrade in Settings → Billing to use it." }, { status: 403 });
  }

  if (panel === "platform") {
    if (!(await isPlatformOwnerContext())) return NextResponse.json({ error: "This assistant is for the platform team." }, { status: 403 });
    const access = await getPlatformAccessForUser(user.id);
    if (!access) return NextResponse.json({ error: "Platform Console access required." }, { status: 403 });
    user.platformPermissions = access.permissions;
  } else if (panel === "cms") {
    const viewer = await getViewer();
    if (!viewer) return NextResponse.json({ error: say("signIn", lang) }, { status: 401 });
    if (await isPlatformOwnerContext()) return NextResponse.json({ error: "This assistant is for company websites." }, { status: 403 });
    user.roles = Array.from(new Set([...user.roles, ...(viewer.roles ?? [])]));
  } else if (!OPEN_PANELS.has(panel) && !hasLevel(user.roles, panel, "any")) {
    return NextResponse.json({ error: say("noAccess", lang) }, { status: 403 });
  }

  try {
    if (body.action === "decide") {
      const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
      if (!decision || typeof body.proposalId !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      const out = await decideProposal({ user, panel, proposalId: body.proposalId, decision, confirmed: body.confirmed === true, note: typeof body.note === "string" ? body.note : undefined, autoApprove: body.autoApprove === true });
      return NextResponse.json(out);
    }
    const history = cleanMessages(body.messages);
    if (!history.length || history[history.length - 1].role !== "user") return NextResponse.json({ error: say("sendFirst", lang) }, { status: 400 });
    const out = await runAgent({ user, panel, history, page: typeof body.page === "string" ? body.page.slice(0, 200) : undefined, autoApprove: body.autoApprove === true });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof BillingLimitError) return NextResponse.json({ error: e.message }, { status: 402 });
    console.error("[ai-agent]", e);
    const st = e as { status?: number; code?: string };
    if (st.status === 429 && /quota|credit/i.test(`${st.code ?? ""} ${e instanceof Error ? e.message : ""}`)) return NextResponse.json({ error: say("noCredit", lang) }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error && /isn't available|not connected/i.test(e.message) ? e.message : say("failed", lang) }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
