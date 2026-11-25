"use server";

import { hiddenProducts } from "@/lib/platform/products/visible";
import { addCandidate, setCandidateStatus } from "@/lib/products/talentos/candidates";
import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { createOffer, updateOfferStatus, updateOfferDetails, getOffer } from "@/lib/products/talentos/offers";
import { isValidOfferStatus } from "@/lib/products/talentos/offers-status";
import { validateOffer, validateOfferDetails } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";
import { notify } from "@/lib/products/talentos/notifications";

export interface OfferActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireRecruiter() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword || !hrCan(user, "recruitment.manage")) throw new Error("Forbidden");
  return user;
}

export async function createOfferAction(input: Record<string, unknown>): Promise<OfferActionResult> {
  const user = await requireRecruiter();
  const v = validateOffer(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await createOffer(v.data, user.id);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "offer",
    entityId: result.offer._id,
    entityLabel: `${result.offer.candidateName} — ${result.offer.positionTitle}`,
  });
  revalidatePath("/talentos/recruitment");
  return { ok: true };
}

export async function updateOfferStatusAction(id: string, status: string): Promise<OfferActionResult> {
  const user = await requireRecruiter();
  if (!isValidOfferStatus(status)) return { ok: false, error: "Invalid status." };

  const result = await updateOfferStatus(id, status, user.id);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "status_change",
    entity: "offer",
    entityId: id,
    entityLabel: `${result.offer.candidateName} — ${result.offer.positionTitle}`,
    summary: `→ ${status}`,
  });
  await notify({
    audience: "staff",
    type: "offer_status",
    title: `Offer ${status}: ${result.offer.candidateName}`,
    body: result.offer.positionTitle,
    link: "/talentos/recruitment",
    entityType: "offer",
    entityId: id,
  });
  revalidatePath("/talentos/recruitment");
  return { ok: true };
}

export async function updateOfferDetailsAction(id: string, input: Record<string, unknown>): Promise<OfferActionResult> {
  const user = await requireRecruiter();
  const offer = await getOffer(id);
  if (!offer) return { ok: false, error: "Offer not found." };

  const v = validateOfferDetails(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updateOfferDetails(id, v.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "offer", entityId: id, entityLabel: offer.candidateName });
  revalidatePath("/talentos/recruitment");
  return { ok: true };
}

export async function setApplicantDoNotContactAction(applicationId: string, value: boolean): Promise<{ error?: string }> {
  const user = await getCurrentHrmsUser();
  if (!user || !hrCan(user, "recruitment.manage")) return { error: "You don't have permission to change this." };
  if (typeof applicationId !== "string" || typeof value !== "boolean") return { error: "Invalid request." };
  const { setApplicantDoNotContact } = await import("@/lib/products/talentos/calls");
  if (!(await setApplicantDoNotContact(applicationId, value))) return { error: "Candidate not found." };
  revalidatePath(`/talentos/recruitment/${applicationId}`);
  return {};
}

/** Candidates are managed here only when the company doesn't have DealFlow, whose permissions guard them otherwise. */
async function requireCandidateKeeper() {
  const user = await requireRecruiter();
  if (!(await hiddenProducts()).has("lms")) throw new Error("Forbidden");
  return user;
}

export async function addCandidateAction(form: FormData): Promise<{ ok: boolean; id?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireCandidateKeeper();
  const result = await addCandidate(form);
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "candidate", entityId: result.id, entityLabel: String(form.get("name") ?? "") });
  revalidatePath("/talentos/recruitment");
  return { ok: true, id: result.id };
}

export async function setCandidateStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireCandidateKeeper();
  const result = await setCandidateStatus(id, status);
  if (result.ok) {
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "candidate", entityId: id, summary: `status → ${status}` });
    revalidatePath("/talentos/recruitment");
    revalidatePath(`/talentos/recruitment/${id}`);
  }
  return result;
}
