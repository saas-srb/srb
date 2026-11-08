"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { createBackup, listBackups } from "@/lib/products/commandos/backups";
import { consumeChallenge, startChallenge, type Confirmation, type DangerAction } from "@/lib/products/commandos/danger";
import { cancelCompanyDeletion, restoreBackup, scheduleCompanyDeletion, wipeCompanyData } from "@/lib/products/commandos/data-lifecycle";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";

const KEY = "company.backups";
const PATH = "/commandos/settings/backups";

async function superAdmin() {
  const user = await requireWorkspaceAction(KEY);
  if (!user.roles.includes("super_admin")) throw new Error("Only a Director can do this.");
  return user;
}
const msg = (err: unknown) => (isBillingLimitError(err) || err instanceof Error ? (err as Error).message : "Something went wrong.");

/** "Back up now": a manual backup (one a minute at most). */
export async function backupNowAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await superAdmin();
    const last = (await listBackups(1))[0];
    if (last && last.kind === "manual" && Date.now() - Date.parse(last.at) < 60_000) return { ok: false, error: "A backup was just made. Wait a minute before making another." };
    const res = await createBackup("manual", { email: user.email });
    if (res.ok) revalidatePath(PATH);
    return res.ok ? { ok: true } : res;
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

/** Step 1 of a destructive action: a challenge the last step has to present. */
export async function startDangerAction(action: DangerAction, ref?: string): Promise<{ ok: true; token: string; phrase: string; companyName: string } | { ok: false; error: string }> {
  try {
    const user = await superAdmin();
    if (!["restore", "wipe", "delete"].includes(action)) return { ok: false, error: "Unknown action." };
    if (action === "restore" && !(await listBackups(200)).some((b) => b.id === ref && b.downloadable)) return { ok: false, error: "Choose a backup that is available." };
    return { ok: true, ...(await startChallenge(user.id, action, action === "restore" ? String(ref) : null)) };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

/** The last step: verifies the typed name, the phrase, the password (and two-step code), then does it. */
export async function confirmDangerAction(action: DangerAction, c: Confirmation): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const user = await superAdmin();
    const doc = await (await getDb()).collection<{ _id: ObjectId; passwordHash: string; twoFactor?: unknown }>("admin_users").findOne({ _id: new ObjectId(user.id) });
    if (!doc) return { ok: false, error: "Sign in again to continue." };
    const checked = await consumeChallenge({ id: user.id, _id: doc._id, passwordHash: doc.passwordHash, twoFactor: doc.twoFactor }, action, c);
    if (!checked.ok) return checked;
    const actor = { id: user.id, email: user.email };
    let message = "";
    if (action === "restore") {
      const r = await restoreBackup(String(checked.ref), actor);
      if (!r.ok) return r;
      message = `Restored: ${r.restore.records.toLocaleString("en-IN")} records written back and ${r.restore.removed.toLocaleString("en-IN")} newer ones removed. A safety copy of what you had is in the list.`;
    } else if (action === "wipe") {
      const r = await wipeCompanyData(actor);
      if (!r.ok) return r;
      message = `All data deleted: ${r.rows.toLocaleString("en-IN")} records and ${r.files} files. A safety copy of the records is kept for 30 days.`;
    } else {
      const r = await scheduleCompanyDeletion(actor);
      if (!r.ok) return r;
      message = `Your company is scheduled for permanent deletion on ${r.purgeAt.toLocaleDateString("en-IN", { dateStyle: "long" })}. Until then it is read-only, and you can cancel from this page.`;
    }
    revalidatePath(PATH);
    revalidatePath("/commandos", "layout");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

/** Brings the account back: cancels a scheduled deletion (works while the workspace is read-only). */
export async function cancelDeletionAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await superAdmin();
    const r = await cancelCompanyDeletion({ id: user.id, email: user.email });
    if (r.ok) {
      revalidatePath(PATH);
      revalidatePath("/commandos", "layout");
    }
    return r;
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}
