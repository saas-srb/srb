import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { lpmsCan } from "@/lib/lpms-roles";
import { cfSealed } from "@/lib/products/contractflow-ai/cf-db";
import { getClone } from "@/lib/products/contractflow-ai/clones";
import { readSealedPdf } from "@/lib/products/contractflow-ai/seal";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";

/** Download of the sealed (signed) PDF of a clone. Session required; the clone's own access rules and the DOWNLOAD permission apply; the file is checked against its recorded hash. */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!lpmsCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "DOWNLOAD")) return NextResponse.json({ error: "You may not download documents." }, { status: 403 });
  const g = await getClone(viewer, id);
  if (!g.ok) return NextResponse.json({ error: g.error.message }, { status: g.error.code === "forbidden" ? 403 : 404 });
  const sealed = await (await cfSealed()).findOne({ cloneId: g.clone._id });
  if (!sealed) return NextResponse.json({ error: "There is no signed copy yet." }, { status: 404 });
  const bytes = await readSealedPdf(sealed);
  if (!bytes) return NextResponse.json({ error: "The signed copy could not be read or does not match its fingerprint." }, { status: 500 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${(g.clone.title.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "signed")}-signed.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ETag: `"${sealed.sha256}"` },
  });
}

export const GET = withTransport(handleGET);
