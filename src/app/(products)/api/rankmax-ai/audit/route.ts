import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { runCrawl, CrawlBusyError } from "@/lib/products/rankmax-ai/crawler";
import { notifySeoUsers } from "@/lib/products/rankmax-ai/notifications";

// A full crawl of a ~100-page site takes 20–60 s; allow up to five minutes.
export const maxDuration = 300;

/** Starts a website audit and responds when it has finished. */
async function handlePOST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!can(viewer, "RUN_AUDIT")) return NextResponse.json({ error: "You don't have permission to run audits." }, { status: 403 });
  try {
    const run = await runCrawl({ trigger: "manual", actorId: viewer.userId, actorEmail: viewer.email });
    if (run.status === "completed") {
      await notifySeoUsers([viewer.userId], { type: "seo_audit_completed", title: `Website audit finished — score ${run.scores?.overall ?? "—"}`, body: `${run.pagesCrawled} pages · ${run.newIssues} new · ${run.resolvedIssues} resolved`, link: `/rankmax-ai/audit/${run._id}` });
    }
    return NextResponse.json({ ok: run.status === "completed", runId: run._id, error: run.error });
  } catch (err) {
    if (err instanceof CrawlBusyError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("[seo audit route]", err);
    return NextResponse.json({ error: "The audit could not be started." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
