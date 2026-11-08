import { withTransport } from "@/lib/security/transport";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { limitOr429 } from "@/lib/security/rate-limit";
import { CONSENT_VERSION } from "@/lib/products/sitecraft-ai/consent";
import { readSafeJson } from "@/lib/security/safe-json";

/**
 * Evidence of a website visitor's cookie choice (compliance: "maintain consent, preference and opt-out records"): the choice, when, which
 * version of the banner, and an anonymous hash of the browser's random device id. No name, email, address or IP is stored. Kept for three
 * years (so a regulator can be shown the choice was made), then removed by the database itself.
 */
const COLLECTION = "site_consent_records";
let indexed = false;

async function handlePOST(req: NextRequest) {
  try {
    const limited = await limitOr429(req, "consent", 30, 600);
    if (limited) return limited;
    if (!(await currentCompanyIdOrNull())) return new NextResponse(null, { status: 204 });
    const b = (await readSafeJson(req, 2048).catch(() => ({}))) as { tracking?: unknown; version?: unknown };
    if (typeof b.tracking !== "boolean") return NextResponse.json({ ok: false, error: "Invalid choice." }, { status: 400 });
    const device = req.cookies.get("yo_did")?.value;
    const col = (await getDb()).collection(COLLECTION);
    if (!indexed) {
      indexed = true;
      await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    }
    const now = new Date();
    await col.insertOne({
      choice: b.tracking ? "accepted" : "rejected",
      version: typeof b.version === "number" ? b.version : CONSENT_VERSION,
      device: device ? createHash("sha256").update(device).digest("hex").slice(0, 32) : null,
      at: now,
      expireAt: new Date(now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000),
    });
  } catch {
    /* recording a choice must never get in the visitor's way */
  }
  return new NextResponse(null, { status: 204 });
}

export const POST = withTransport(handlePOST);
