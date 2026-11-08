import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getVCardById, getVCard } from "@/lib/products/viralpulse-ai/vcard/store";
import { renderVCardPdfToBuffer } from "@/lib/products/viralpulse-ai/vcard/VCardPdfDocument";
import type { VCardDetail } from "@/lib/products/viralpulse-ai/vcard/types";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Card ID or slug required." }, { status: 400 });
  }

  // Find by ID or by Slug
  let doc = await getVCardById(id).catch(() => null);
  if (!doc) {
    doc = await getVCard(id).catch(() => null);
  }

  if (!doc) {
    return NextResponse.json({ error: "Visiting card not found." }, { status: 404 });
  }

  const detail: VCardDetail = {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    name: doc.name,
    jobTitle: doc.jobTitle,
    company: doc.company,
    bio: doc.bio,
    layout: doc.layout,
    colorScheme: doc.colorScheme,
    style: doc.style,
    contact: doc.contact,
    branding: doc.branding,
    sections: doc.sections,
    status: doc.status,
    analytics: {
      views: doc.analytics.views,
      ctaClicks: doc.analytics.ctaClicks,
      shares: doc.analytics.shares,
      lastViewedAt: doc.analytics.lastViewedAt?.toISOString() ?? null,
    },
    meta: doc.meta,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  // Generate QR code data URI
  const publicUrl = `${req.nextUrl.origin}/vcard/${detail.slug}`;
  let qrDataUri: string | null = null;
  try {
    qrDataUri = await QRCode.toDataURL(publicUrl, {
      width: 120,
      margin: 1,
      color: {
        dark: detail.style.primaryColor || "#000000",
        light: detail.style.backgroundColor || "#ffffff",
      },
    });
  } catch {
    qrDataUri = null;
  }

  try {
    const buffer = await renderVCardPdfToBuffer(detail, qrDataUri);

    const safeName = detail.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "VisitingCard";
    const download = req.nextUrl.searchParams.get("download") !== "0";

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}_VisitingCard.pdf"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[vcard-pdf] Render error:", err);
    return NextResponse.json(
      { error: "Failed to generate visiting card PDF." },
      { status: 500 }
    );
  }
}
