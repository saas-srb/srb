"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees } from "@/lib/hrms-roles";
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
  if (!canManageEmployees(user)) throw new Error("Forbidden");
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
  if (!user || !canManageEmployees(user)) return { error: "You don't have permission to change this." };
  if (typeof applicationId !== "string" || typeof value !== "boolean") return { error: "Invalid request." };
  const { setApplicantDoNotContact } = await import("@/lib/products/talentos/calls");
  if (!(await setApplicantDoNotContact(applicationId, value))) return { error: "Candidate not found." };
  revalidatePath(`/talentos/recruitment/${applicationId}`);
  return {};
}
