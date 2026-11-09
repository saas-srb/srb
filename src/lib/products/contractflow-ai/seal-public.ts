import "server-only";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { cfClones, cfParties, cfSealIndex, cfSealed } from "./cf-db";

export interface PublicSeal {
  title: string;
  companyName: string;
  sealedAt: string;
  sha256: string;
  pages: number | null;
  signers: { name: string; role: string; designation: string | null; signedAt: string | null }[];
}

/** What the public verify page may show about a sealed document: no email addresses, no file. The code is random and unguessable. */
export async function getPublicSeal(code: string): Promise<PublicSeal | null> {
  if (!/^[A-Za-z0-9]{16}$/.test(code)) return null;
  const idx = await (await cfSealIndex()).findOne({ _id: code });
  if (!idx) return null;
  return runAsCompany(idx.companyId, async () => {
    const s = await (await cfSealed()).findOne({ verifyCode: code });
    if (!s) return null;
    return { title: s.title, companyName: s.companyName, sealedAt: s.sealedAt.toISOString(), sha256: s.sha256, pages: s.pages, signers: s.signers.map((x) => ({ name: x.name, role: x.role, designation: x.designation, signedAt: x.signedAt ? x.signedAt.toISOString() : null })) };
  });
}

export interface EmployeeContractDoc { cloneId: string; title: string; kind: string; status: string; signedAt: string | null; hasSignedCopy: boolean }

/** Signed and issued ContractFlow documents of one employee (the party is a link to their TalentOS record). The caller must have checked who may see them. */
export async function listEmployeeContractDocs(employeeId: string): Promise<EmployeeContractDoc[]> {
  if (typeof employeeId !== "string" || employeeId.length === 0 || employeeId.length > 64) return [];
  const parties = await (await cfParties()).find({ type: "employee", "source.collection": "hrms_employees", "source.id": employeeId }, { projection: { _id: 1 } }).toArray();
  if (parties.length === 0) return [];
  const clones = await (await cfClones()).find({ "party.partyId": { $in: parties.map((p) => p._id) }, deletedAt: null, status: { $in: ["signed", "partially_signed", "sent"] } } as never, { projection: { title: 1, kind: 1, status: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(100).toArray();
  const sealed = new Set((await (await cfSealed()).find({ cloneId: { $in: clones.map((c) => c._id) } }, { projection: { cloneId: 1 } }).toArray()).map((s) => s.cloneId));
  return clones.filter((c) => c.status === "signed").map((c) => ({ cloneId: c._id, title: c.title, kind: c.kind ?? "document", status: c.status, signedAt: c.updatedAt.toISOString(), hasSignedCopy: sealed.has(c._id) }));
}
