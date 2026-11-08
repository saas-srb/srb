import { withTransport } from "@/lib/security/transport";
import { limitOr429 } from "@/lib/security/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { readSafeJson } from "@/lib/security/safe-json";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { applyChatCookies, ensureVisitorCookie, hashClientIp } from "@/lib/chatbot-sessions";
import { validateIdentity, upsertVisitorProfile } from "@/lib/chat-visitors";
import { isValidCategory } from "@/lib/categories";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { CATEGORY_TO_SOURCE, type LeadManagementSource } from "@/lib/lead-management/types";
import { createPortalSession, setPortalSessionCookie } from "@/lib/portal-auth";

/**
 * Captures the visitor's details from the pre-chat form and — the Ask AI →
 * Account Creation → Public Portal flow — turns a brand-new email into a real
 * Lead + portal account the visitor is immediately signed into, same as every
 * other public intake form (`/api/leads/[category]`, `/api/careers/apply`).
 * The visitor is never redirected: they stay in the chat window and the
 * header picks up the new session on its own (see `portal:session-changed`).
 */
async function handlePOST(req: NextRequest) {
  const limited = process.env.NODE_ENV === "production" ? await limitOr429(req, "chat-identify", 30, 3600) : null;
  if (limited) return limited;
  const config = await getChatbotConfig();

  let body: Record<string, unknown>;
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validation = validateIdentity(body, config.preChat);
  if (!validation.valid) {
    return NextResponse.json({ error: "Please check the highlighted fields.", fields: validation.errors }, { status: 422 });
  }

  const { visitorId, cookiesToSet } = ensureVisitorCookie(req);
  await upsertVisitorProfile(visitorId, { ...validation.data, ipHash: hashClientIp(req) });

  let portalSignedIn = false;
  if (validation.data.email) {
    try {
      const source: LeadManagementSource =
        validation.data.service && isValidCategory(validation.data.service)
          ? CATEGORY_TO_SOURCE[validation.data.service]
          : "client_inquiry";

      const result = await provisionLeadAndAccount({
        source,
        name: validation.data.name || validation.data.email.split("@")[0],
        email: validation.data.email,
        phone: validation.data.phone || "",
        message: "Captured via the Ask AI chat assistant.",
      });

      // Only a brand-new account is signed in automatically. An email that already
      // has an account is NOT proof of identity — logging the chat visitor into it
      // would let anyone take over any account whose email they happen to know.
      if (result.isNewAccount) {
        const { token } = await createPortalSession(result.externalUserId, false);
        await setPortalSessionCookie(token, false);
        portalSignedIn = true;
      }
    } catch (provErr) {
      console.error("Ask AI lead/account provisioning failed (chat identity still saved)", provErr);
    }
  }

  const res = NextResponse.json({ ok: true, identified: true, name: validation.data.name, portalSignedIn });
  return applyChatCookies(res, cookiesToSet);
}

export const POST = withTransport(handlePOST);
