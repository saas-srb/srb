import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees } from "@/lib/hrms-roles";
import { cfClones, cfParties, cfSealed } from "@/lib/products/contractflow-ai/cf-db";
import { readSealedPdf } from "@/lib/products/contractflow-ai/seal";

/**
 * Download of a signed ContractFlow document from the employee's TalentOS profile. Only HR (people who manage employees) and the employee the
 * document was signed for may download it; everyone else gets "not found".
 */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ cloneId: string }> }) {
  const user = await getCurrentHrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { cloneId } = await params;
  const clone = typeof cloneId === "string" && cloneId.length <= 64 ? await (await cfClones()).findOne({ _id: cloneId, deletedAt: null } as never) : null;
  const party = clone?.party.partyId ? await (await cfParties()).findOne({ _id: clone.party.partyId }) : null;
  const employeeId = party?.type === "employee" && party.source?.collection === "hrms_employees" ? party.source.id : null;
  const allowed = !!employeeId && (canManageEmployees(user) || user.employeeId === employeeId);
  if (!clone || !allowed || clone.status !== "signed") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sealed = await (await cfSealed()).findOne({ cloneId: clone._id });
  if (!sealed) return NextResponse.json({ error: "The signed copy is not ready yet." }, { status: 404 });
  const bytes = await readSealedPdf(sealed);
  if (!bytes) return NextResponse.json({ error: "The signed copy could not be read." }, { status: 500 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${(clone.title.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "signed")}-signed.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const GET = withTransport(handleGET);
