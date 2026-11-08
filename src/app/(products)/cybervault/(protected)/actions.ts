"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getCurrentDlmsUser } from "@/lib/dlms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import type { DlmsPermission } from "@/lib/dlms-roles";
import { RECORD_TYPES, STATUSES, type RecordStatus, type RecordType } from "@/lib/products/cybervault/constants";
import { requireViewer, can, DlmsInputError, ForbiddenError, type DlmsViewer } from "@/lib/products/cybervault/viewer";
import { recordAudit } from "@/lib/products/cybervault/audit";
import { markDlmsNotificationsRead, notifyDlmsUsers } from "@/lib/products/cybervault/notifications";
import {
  createCredential,
  createLink,
  createNote,
  deleteRecord,
  revealCredential,
  setRecordStatus,
  updateCredential,
  updateDocument,
  updateLink,
  updateNote,
} from "@/lib/products/cybervault/records";
import { setAccess } from "@/lib/products/cybervault/access";
import { saveSettings } from "@/lib/products/cybervault/settings";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Every DLMS mutation. Each action resolves the viewer from the SESSION COOKIE
 * (never from arguments), re-checks the specific permission here, and the data
 * layer re-checks company/client scope. Expected failures return
 * `{ ok:false, error }` so the client can show the message. Nothing here ever
 * returns or logs a stored secret except `revealCredentialAction`, which
 * returns it to the one authorised caller.
 */

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };
const DENIED: Fail = { ok: false, error: "You don't have permission to do that." };

async function run<T extends object>(permission: DlmsPermission, fn: (v: DlmsViewer) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<Ok<T> | Fail> {
  let v: DlmsViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  if (!can(v, permission)) return DENIED;
  if (permission !== "REVEAL") {
    const readOnly = await writeBlockReason();
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    const out = await fn(v);
    if (opts.revalidate !== false) revalidatePath("/cybervault", "layout");
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof DlmsInputError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return DENIED;
    console.error("[dlms action]", err instanceof Error ? err.message : "unknown error");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const isType = (v: unknown): v is RecordType => typeof v === "string" && (RECORD_TYPES as readonly string[]).includes(v);
const asInput = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Logs out of EVERY product (single sign-off), like every other product. */
export async function dlmsLogoutAction(): Promise<void> {
  const user = await getCurrentDlmsUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}

export async function markNotificationsReadAction(ids?: string[]) {
  const v = await requireViewer().catch(() => null);
  if (!v) return;
  await markDlmsNotificationsRead(v.userId, ids?.filter((i) => typeof i === "string"));
  revalidatePath("/cybervault", "layout");
}

// ── Credentials ───────────────────────────────────────────────────────────

export async function saveCredentialAction(id: string | null, input: Record<string, unknown>) {
  const data = asInput(input);
  return run(id ? "EDIT" : "CREATE", async (v) => {
    if (id) {
      await updateCredential(v, String(id), data);
      return { id: String(id) };
    }
    return { id: await createCredential(v, data) };
  });
}

/** Returns the plaintext password to the one caller that asked, after the permission + scope + audit checks. */
export async function revealCredentialAction(id: string, purpose: "reveal" | "copy"): Promise<{ ok: true; secret: string } | Fail> {
  const res = await run("REVEAL", async (v) => ({ secret: await revealCredential(v, String(id), purpose === "copy" ? "copy" : "reveal") }), { revalidate: false });
  return res as { ok: true; secret: string } | Fail;
}

// ── Documents ─────────────────────────────────────────────────────────────

const inputFrom = (fd: FormData): Record<string, unknown> => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

/** Edits a document's details. New documents and new versions upload through `/api/cybervault/documents` (bodies > 1 MB). */
export async function saveDocumentAction(id: string, formData: FormData) {
  return run("MANAGE_DOCUMENTS", async (v) => {
    await updateDocument(v, String(id), inputFrom(formData));
    return { id: String(id) };
  });
}

// ── URLs & accounts / notes ───────────────────────────────────────────────

export async function saveLinkAction(id: string | null, input: Record<string, unknown>) {
  const data = asInput(input);
  return run(id ? "EDIT" : "CREATE", async (v) => {
    if (id) {
      await updateLink(v, String(id), data);
      return { id: String(id) };
    }
    return { id: await createLink(v, data) };
  });
}

export async function saveNoteAction(id: string | null, input: Record<string, unknown>) {
  const data = asInput(input);
  return run(id ? "EDIT" : "CREATE", async (v) => {
    if (id) {
      await updateNote(v, String(id), data);
      return { id: String(id) };
    }
    return { id: await createNote(v, data) };
  });
}

// ── Shared record actions ─────────────────────────────────────────────────

export async function setStatusAction(type: string, id: string, status: string) {
  if (!isType(type) || !(STATUSES as readonly string[]).includes(status)) return { ok: false as const, error: "Invalid request." };
  return run("EDIT", async (v) => {
    await setRecordStatus(v, type, String(id), status as RecordStatus);
    return {};
  });
}

export async function deleteRecordAction(type: string, id: string) {
  if (!isType(type)) return { ok: false as const, error: "Invalid request." };
  return run("DELETE", async (v) => {
    await deleteRecord(v, type, String(id));
    return {};
  });
}

// ── Access & settings ─────────────────────────────────────────────────────

export async function saveAccessAction(userId: string, input: { companyAccess: boolean; clientIds: string[] }) {
  const clientIds = Array.isArray(input?.clientIds) ? input.clientIds.filter((x): x is string => typeof x === "string") : [];
  return run("MANAGE_ACCESS", async (v) => {
    const { added } = await setAccess(String(userId), { companyAccess: Boolean(input?.companyAccess), clientIds }, v.userId);
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "assign",
      entity: "access",
      entityId: String(userId),
      entityLabel: String(userId),
      summary: `Set access: company ${input?.companyAccess ? "yes" : "no"}, ${clientIds.length} client${clientIds.length === 1 ? "" : "s"}`,
      metadata: { companyAccess: Boolean(input?.companyAccess), clients: clientIds.length, newlyGranted: added.length },
    });
    if (added.length > 0 || input?.companyAccess) {
      await notifyDlmsUsers([String(userId)], { type: "dlms_access", title: "Your CyberVault access was updated", body: `You can now open ${clientIds.length} client vault${clientIds.length === 1 ? "" : "s"}${input?.companyAccess ? " and the company vault" : ""}.`, link: "/cybervault/clients" });
    }
    return {};
  });
}

export async function saveSettingsAction(input: { warnDays: number; alertsEnabled: boolean }) {
  return run("MANAGE_SETTINGS", async (v) => {
    await saveSettings({ warnDays: Number(input?.warnDays) || 30, alertsEnabled: Boolean(input?.alertsEnabled) }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "main", entityLabel: "CyberVault settings", summary: `Expiry warning window ${Number(input?.warnDays) || 30} days; alerts ${input?.alertsEnabled ? "on" : "off"}` });
    return {};
  });
}
