"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { clearCertificate, recordCertificate, removeLowerCert, saveLowerCert } from "@/lib/products/cashflow-ai/tds/certificates-store";

type Result = { ok: true } | { ok: false; error: string };

// Every action re-checks the permission: hiding a button on the page is not the boundary.
async function guard(): Promise<{ error: string; actor?: undefined } | { actor: { id: string; email: string | null }; error?: undefined }> {
  const user = await getCurrentFmsUser();
  if (!user) return { error: "Please sign in again." };
  if (!canManageCompliance(user)) return { error: "You do not have permission to change TDS certificates." };
  return { actor: { id: user.id, email: user.email } };
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
const done = (res: Result): Result => {
  if (res.ok) revalidatePath("/cashflow-ai/tds", "layout");
  return res;
};

export async function recordCertificateAction(input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  const i = (input ?? {}) as Record<string, unknown>;
  const vendorId = str(i.vendorId, 100), section = str(i.section, 20), fy = str(i.fy, 10), issuedOn = str(i.issuedOn, 10), certificateNumber = str(i.certificateNumber, 100);
  if (!vendorId || !section || !fy || typeof i.quarter !== "number" || issuedOn === null || certificateNumber === null) return { ok: false, error: "Fill in the issue date and certificate number." };
  if (i.note != null && str(i.note, 500) === null) return { ok: false, error: "Keep the note under 500 characters." };
  return done(await recordCertificate({ vendorId, section, fy, quarter: i.quarter, issuedOn, certificateNumber, note: (i.note as string | null | undefined) ?? null }, g.actor));
}

export async function clearCertificateAction(input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  const i = (input ?? {}) as Record<string, unknown>;
  const vendorId = str(i.vendorId, 100), section = str(i.section, 20), fy = str(i.fy, 10);
  if (!vendorId || !section || !fy || typeof i.quarter !== "number") return { ok: false, error: "Certificate not found." };
  return done(await clearCertificate({ vendorId, section, fy, quarter: i.quarter }, g.actor));
}

export async function saveLowerCertAction(id: unknown, input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (id !== null && str(id, 100) === null) return { ok: false, error: "Certificate not found." };
  const i = (input ?? {}) as Record<string, unknown>;
  const vendorId = str(i.vendorId, 100), section = str(i.section, 20), certificateNumber = str(i.certificateNumber, 100), validFrom = str(i.validFrom, 10), validTo = str(i.validTo, 10);
  if (vendorId === null || section === null || certificateNumber === null || validFrom === null || validTo === null) return { ok: false, error: "Fill in the vendor, section, certificate number and valid dates." };
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  if (i.note != null && str(i.note, 500) === null) return { ok: false, error: "Keep the note under 500 characters." };
  return done(await saveLowerCert(id as string | null, { vendorId, section, certificateNumber, nil: i.nil === true, rate: num(i.rate), validFrom, validTo, maxAmount: num(i.maxAmount), note: (i.note as string | null | undefined) ?? null }, g.actor));
}

export async function removeLowerCertAction(id: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (typeof id !== "string" || !id || id.length > 100) return { ok: false, error: "Certificate not found." };
  return done(await removeLowerCert(id, g.actor));
}
