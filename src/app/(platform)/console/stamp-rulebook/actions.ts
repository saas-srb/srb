"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import type { PlatformPermission } from "@/lib/platform/console/permissions";
import { confirmEntry, copyEntries, jurisdictionHistory, removeEntry, saveEntry, unconfirmEntry, type StoreResult } from "@/lib/products/contractflow-ai/stamp/store";
import { jurisdictionByCode, type StampEntryContent } from "@/lib/products/contractflow-ai/stamp/structure";

type Result = { ok: true; entryId?: string } | { ok: false; errors: string[]; conflict?: boolean };

async function gate(perm: PlatformPermission) {
  const auth = await checkPlatformPermission(perm);
  return auth.ok ? { ok: true as const, actor: { id: auth.user.id, email: auth.user.email } } : { ok: false as const, errors: [auth.error] };
}
const BAD: Result = { ok: false, errors: ["That state or union territory is not in the list."] };
const done = (r: StoreResult<{ entryId?: string; copied?: number }>): Result => {
  if (r.ok) {
    revalidatePath("/console/stamp-rulebook");
    return { ok: true, entryId: "entryId" in r ? r.entryId : undefined };
  }
  return r;
};
const validVersion = (v: number) => Number.isInteger(v) && v >= 0;

export async function saveEntryAction(code: string, entryId: string | null, content: StampEntryContent, version: number): Promise<Result> {
  const g = await gate("stamp.edit");
  if (!g.ok) return g;
  if (!jurisdictionByCode(code) || !validVersion(version)) return BAD;
  return done(await saveEntry(code, entryId, content, version, g.actor));
}

export async function removeEntryAction(code: string, entryId: string, version: number): Promise<Result> {
  const g = await gate("stamp.edit");
  if (!g.ok) return g;
  if (!jurisdictionByCode(code) || !validVersion(version)) return BAD;
  return done(await removeEntry(code, entryId, version, g.actor));
}

export async function copyEntriesAction(fromCode: string, toCode: string, version: number): Promise<Result> {
  const g = await gate("stamp.edit");
  if (!g.ok) return g;
  if (!jurisdictionByCode(fromCode) || !jurisdictionByCode(toCode) || !validVersion(version)) return BAD;
  return done(await copyEntries(fromCode, toCode, version, g.actor));
}

/** Confirming is its own permission: an editor without it cannot mark anything as checked. */
export async function confirmEntryAction(code: string, entryId: string, version: number): Promise<Result> {
  const g = await gate("stamp.confirm");
  if (!g.ok) return g;
  if (!jurisdictionByCode(code) || !validVersion(version)) return BAD;
  return done(await confirmEntry(code, entryId, version, g.actor));
}

export async function unconfirmEntryAction(code: string, entryId: string, version: number): Promise<Result> {
  const g = await gate("stamp.confirm");
  if (!g.ok) return g;
  if (!jurisdictionByCode(code) || !validVersion(version)) return BAD;
  return done(await unconfirmEntry(code, entryId, version, g.actor));
}

export async function historyAction(code: string) {
  const auth = await checkPlatformPermission("stamp.read");
  if (!auth.ok || !jurisdictionByCode(code)) return [];
  return jurisdictionHistory(code);
}
