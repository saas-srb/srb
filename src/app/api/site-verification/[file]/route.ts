import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getTracking, VERIFICATION_FILE_RE } from "@/lib/products/sitecraft-ai/tracking";

/**
 * Serves the company's search-engine verification files at its site root
 * (`/google….html`, `/BingSiteAuth.xml`, `/ads.txt` … — rewritten here by next.config.ts).
 * The files are whatever the company saved in CMS → Settings → Tracking; anything else is a 404.
 */
async function handleGET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!VERIFICATION_FILE_RE.test(file)) return new NextResponse("Not found", { status: 404 });
  const match = (await getTracking()).verificationFiles.find((f) => f.name === file);
  if (!match) return new NextResponse("Not found", { status: 404 });
  const type = file.endsWith(".xml") ? "application/xml" : file.endsWith(".json") ? "application/json" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".txt") || file.endsWith(".csv") ? "text/plain" : "text/html";
  return new NextResponse(match.content, { headers: {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": "public, max-age=300",
      // These are plain verification/text files — never let a browser sniff or run them as a page.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

export const GET = withTransport(handleGET);
