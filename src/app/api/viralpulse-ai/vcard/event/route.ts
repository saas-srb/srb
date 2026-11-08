import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, type } = body as { slug?: string; type?: string };
    if (!slug || !type) {
      return NextResponse.json({ error: "slug and type required" }, { status: 400 });
    }

    const { incrementVCardView, incrementVCardCtaClick, incrementVCardShare } =
      await import("@/lib/products/viralpulse-ai/vcard/store");

    if (type === "view") {
      await incrementVCardView(slug).catch(() => {});
    } else if (type === "cta_click") {
      // Need id for cta_click
      const id = body.id as string;
      if (id) await incrementVCardCtaClick(id).catch(() => {});
    } else if (type === "share") {
      const id = body.id as string;
      if (id) await incrementVCardShare(id).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 204 });
  }
}
