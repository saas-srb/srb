import { NextResponse } from "next/server";
import { recordBrochureFormSubmit } from "@/lib/products/viralpulse-ai/brochure/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brochureId, brochureTitle, fields } = body;

    if (!brochureId || typeof brochureId !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid brochure ID." }, { status: 400 });
    }
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ ok: false, error: "Form fields are required." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    await recordBrochureFormSubmit(
      brochureId,
      typeof brochureTitle === "string" ? brochureTitle : "Untitled Brochure",
      fields,
      { ip: ip ? ip.split(",")[0].trim() : undefined, userAgent: userAgent ?? undefined }
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[brochure-lead-api]", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
