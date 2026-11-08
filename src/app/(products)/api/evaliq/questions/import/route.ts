import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { importQuestions, readSheet } from "@/lib/products/evaliq/questions";
import { listCategories } from "@/lib/products/evaliq/categories";
import { recordAudit } from "@/lib/products/evaliq/audit";
import { OtsInputError } from "@/lib/products/evaliq/viewer";

export const maxDuration = 300;

/**
 * Question import (CSV / XLSX). `commit=0` validates every row and returns a
 * preview; `commit=1` inserts the valid rows. A route handler (not a server
 * action) because server actions cap request bodies at 1 MB.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(viewer, "IMPORT_QUESTIONS") || !can(viewer, "CREATE_QUESTION")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 4 MB." }, { status: 400 });
  const commit = form?.get("commit") === "1";
  try {
    const rows = await readSheet(file.name, Buffer.from(await file.arrayBuffer()));
    if (rows.length === 0) return NextResponse.json({ error: "The file has no data rows." }, { status: 400 });
    const cats = await listCategories("question");
    const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c._id]));
    const { preview, created } = await importQuestions(rows, byName, viewer.userId, commit);
    if (commit && created > 0)
      await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "import", entity: "question", entityId: "import", entityLabel: file.name.slice(0, 80), summary: `${created} question(s) imported, ${preview.filter((p) => !p.ok).length} row(s) skipped` });
    return NextResponse.json({ preview, created, valid: preview.filter((p) => p.ok).length, invalid: preview.filter((p) => !p.ok).length });
  } catch (err) {
    if (err instanceof OtsInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[ots import]", (err as Error)?.message);
    return NextResponse.json({ error: "Could not read that file." }, { status: 400 });
  }
}

export const POST = withTransport(handlePOST);
