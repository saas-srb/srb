import { withTransport } from "@/lib/security/transport";
import { hasBearer } from "@/lib/security/bearer";
import { NextRequest, NextResponse } from "next/server";
import { authorizeChatbotApi } from "@/app/(products)/commandos/(protected)/chatbot/access";
import { isOpenAIConfigured } from "@/lib/openai";
import { beginWebsiteIndex, chatbotCrawlBaseOverride, runWebsiteIndex } from "@/lib/kb-website";
import { listKbRuns, reapStaleRuns } from "@/lib/kb-runs";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { afterForCompany } from "@/lib/platform/tenancy/context";

async function authorize(req: NextRequest): Promise<string | null> {
  const secret = process.env.CHATBOT_ADMIN_API_SECRET;
  if (hasBearer(req, secret)) return "api";
  const auth = await authorizeChatbotApi("manage");
  return auth.ok ? auth.email : null;
}

/** Recent indexing runs (for polling progress). */
async function handleGET(req: NextRequest) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await reapStaleRuns();
  return NextResponse.json({ runs: await listKbRuns(15) });
}

// Indexing can take several minutes; the crawl runs in `after()` so the
// response returns immediately with a run id the caller can poll.
// Capped at 300 (Vercel Hobby plan's max serverless function duration).
export const maxDuration = 300;

/**
 * Triggers a knowledge-base re-index of the website content. Authorised by
 * either an lmsUser session or the `CHATBOT_ADMIN_API_SECRET` bearer token
 * (mirrors src/app/api/indexing/route.ts) so it can be run from cron / CI.
 */
async function handlePOST(req: NextRequest) {
  const triggeredBy = await authorize(req);
  if (!triggeredBy) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isOpenAIConfigured())) {
    return NextResponse.json({ error: "OpenAI isn't connected. Add your key in Workspace → Settings → Integrations." }, { status: 503 });
  }

  let body: { incremental?: unknown; baseUrl?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // no body — default to a full re-index
  }

  // The crawl may only start from this company's own site (or the platform's configured override) — never an address the caller picks.
  const site = await companySiteUrl();
  let requested: string | null = null;
  if (typeof body.baseUrl === "string" && body.baseUrl) {
    try {
      requested = new URL(body.baseUrl).host === new URL(site).host ? body.baseUrl : null;
    } catch {
      requested = null;
    }
    if (!requested) return NextResponse.json({ error: "The address must be this company's own website." }, { status: 400 });
  }
  const baseUrl =
    requested ||
    (await chatbotCrawlBaseOverride()) ||
    req.nextUrl.origin ||
    (await companySiteUrl());
  const incremental = body.incremental === true;

  const { runId, logger } = await beginWebsiteIndex({ triggeredBy, incremental });
  await afterForCompany(() => runWebsiteIndex(logger, { baseUrl, incremental, triggeredBy }));

  return NextResponse.json({ ok: true, runId });
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
