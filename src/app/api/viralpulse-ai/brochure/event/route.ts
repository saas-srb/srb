import { NextResponse } from "next/server";
import { recordBrochureView, recordBrochureCta } from "@/lib/products/viralpulse-ai/brochure/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brochureId, type, section, referrer, device } = body;

    if (!brochureId || typeof brochureId !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid brochure ID." }, { status: 400 });
    }

    if (type === "view") {
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
      await recordBrochureView(brochureId, {
        referrer: typeof referrer === "string" ? referrer.slice(0, 300) : undefined,
        device: typeof device === "string" ? device : undefined,
        ip: ip ? ip.split(",")[0].trim() : undefined,
      });
    } else if (type === "cta_click") {
      await recordBrochureCta(
        brochureId,
        typeof section === "string" ? section.slice(0, 80) : "general"
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[brochure-event-api]", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
