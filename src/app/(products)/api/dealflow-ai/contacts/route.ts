import { NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { loadPipelineContactsFromDb } from "@/lib/dealflow-ai/db-contacts";
import type { PipelineTab } from "@/lib/dealflow-ai/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // P8-A: this route had no check at all, so anyone who reached the company's address could read its pipeline. It needs the view-leads feature.
  if (!(await requireLms("leads.view"))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const pipeline = (searchParams.get("pipeline") as PipelineTab) || undefined;
    const search = searchParams.get("search") || undefined;

    let contacts = await loadPipelineContactsFromDb(pipeline);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      contacts = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.titleOrService.toLowerCase().includes(q) ||
          c.source.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ ok: true, contacts, total: contacts.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
