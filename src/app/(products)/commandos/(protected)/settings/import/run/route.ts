import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { requestOrigin } from "@/lib/platform/request";
import { previewImport, runImport } from "@/lib/platform/import";
import { IMPORT_MAX_BYTES } from "@/lib/platform/import/shared";

/**
 * POST /commandos/settings/import/run — { type, csv, mapping, dryRun, leadType?, sendInvites? }.
 * A route handler rather than a server action so a 2 MB file fits (server
 * actions cap the request body at 1 MB). Company Directors only.
 */
export const maxDuration = 300;

const REVALIDATE: Record<string, string[]> = { leads: ["/dealflow-ai/leads", "/dealflow-ai"], clients: ["/sprintos/clients", "/sprintos"], employees: ["/talentos/employees", "/talentos"] };

export async function POST(req: Request) {
  const user = await getCurrentHubUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
  if (!user.roles.includes("super_admin")) return NextResponse.json({ ok: false, error: "Only a Director can import data." }, { status: 403 });
  // Same-origin only: a cross-site page can't post a JSON body with this header check passing.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ ok: false, error: "Unsupported request." }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > IMPORT_MAX_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: "The file is larger than 2 MB. Split it into smaller files." }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Unsupported request." }, { status: 400 });
  }
  const request = { type: body.type, csv: body.csv, mapping: body.mapping, leadType: body.leadType, sendInvites: body.sendInvites === true };

  if (body.dryRun !== false) return NextResponse.json(await previewImport(request));

  const { origin } = await requestOrigin();
  const result = await runImport(request, { id: user.id, email: user.email }, origin);
  if (result.ok && result.created > 0) for (const path of REVALIDATE[result.type] ?? []) revalidatePath(path);
  return NextResponse.json(result);
}
