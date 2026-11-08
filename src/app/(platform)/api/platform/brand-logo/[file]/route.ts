import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { readCompanyLogo } from "@/lib/platform/branding/logo";

/** Serves the current company's uploaded logo (public by nature — it appears on sign-in pages and emails). */
async function handleGET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const logo = await readCompanyLogo((await params).file);
  if (!logo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.body), {
    headers: {
      "Content-Type": logo.contentType,
      // Filenames are unique per upload, so a cached copy never goes stale.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
