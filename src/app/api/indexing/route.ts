import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/security/bearer";
import { notifyGoogleIndexing, IndexingNotificationType } from "@/lib/google-indexing";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

async function handlePOST(req: Request) {
  // Fail closed: with no secret configured nobody can call this (it used to be open), and the comparison is constant-time.
  if (!hasBearer(req, process.env.INDEXING_API_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { slug, url, type = "URL_UPDATED" } = body as {
      slug?: string;
      url?: string;
      type?: IndexingNotificationType;
    };

    const targetUrl = url || (slug ? `${await companySiteUrl()}/careers/${slug}` : null);
    // Only this company's own site can be submitted — never an arbitrary address.
    if (targetUrl) {
      try {
        if (new URL(targetUrl).host !== new URL(await companySiteUrl()).host) return NextResponse.json({ error: "That address is not part of this company's website." }, { status: 400 });
      } catch {
        return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
      }
    }

    if (!targetUrl) {
      return NextResponse.json(
        { error: "Missing required parameter: 'slug' or 'url'" },
        { status: 400 }
      );
    }

    const result = await notifyGoogleIndexing(targetUrl, type);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

export const POST = withTransport(handlePOST);
