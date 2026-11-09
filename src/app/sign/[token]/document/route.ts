import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { renderCloneDoc } from "@/lib/products/contractflow-ai/clone-render";
import { REFUSAL_COPY, resolveSignerToken } from "@/lib/products/contractflow-ai/public-access";
import { cloneForRequest, markDocumentViewed } from "@/lib/products/contractflow-ai/sign-flow";

/** The document a signer reviews: the clone as PDF, rendered strictly (no blanks), inline or as a download (`?download=1`). Token in the path is the credential. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await nextHeaders();
  const access = await resolveSignerToken(token, h);
  if (!access.ok) return new NextResponse(REFUSAL_COPY[access.reason].title, { status: access.reason === "rate_limited" ? 429 : 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  const clone = await access.inCompany(() => cloneForRequest(access.request));
  if (!clone) return new NextResponse("The document is not available.", { status: 404, headers: { "Cache-Control": "no-store" } });
  let file;
  try {
    file = await access.inCompany(() => renderCloneDoc(clone, "pdf", { strict: true }));
  } catch {
    return new NextResponse("The document could not be prepared. Please contact the sender.", { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  await markDocumentViewed(access, h);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
