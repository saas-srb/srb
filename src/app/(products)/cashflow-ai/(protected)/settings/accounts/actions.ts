"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageAccounts } from "@/lib/fms-roles";
import { createAccount, updateAccount, deleteAccount, seedDefaultAccounts, type AccountWriteData } from "@/lib/products/cashflow-ai/accounts";
import { isValidAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface AccountActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate() {
  revalidatePath("/cashflow-ai/settings/accounts");
  revalidatePath("/cashflow-ai/transactions");
}

function buildPayload(input: Record<string, unknown>): { ok: true; data: AccountWriteData } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const code = String(input.code ?? "").trim();
  if (!code) errors.code = "Enter an account code.";
  const name = String(input.name ?? "").trim();
  if (!name) errors.name = "Enter an account name.";
  const type = String(input.type ?? "");
  if (!isValidAccountType(type)) errors.type = "Select an account type.";

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    data: {
      code,
      name,
      type: type as AccountWriteData["type"],
      parentId: (input.parentId as string) || null,
      description: (input.description as string)?.trim() || null,
      isActive: input.isActive !== false,
    },
  };
}

export async function saveAccountAction(input: Record<string, unknown>, id?: string): Promise<AccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAccounts(user)) throw new Error("Forbidden");

  const built = buildPayload(input);
  if (!built.ok) return { ok: false, fieldErrors: built.fieldErrors };

  if (id) {
    const updated = await updateAccount(id, built.data, user.id);
    if (!updated) return { ok: false, error: "Account not found." };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "account", entityId: id, entityLabel: updated.code });
    revalidate();
    return { ok: true, id };
  }

  const created = await createAccount(built.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "account", entityId: created._id, entityLabel: created.code });
  revalidate();
  return { ok: true, id: created._id };
}

export async function deleteAccountAction(id: string): Promise<AccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAccounts(user)) throw new Error("Forbidden");
  const res = await deleteAccount(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "account", entityId: id });
  revalidate();
  return { ok: true };
}

export async function seedDefaultAccountsAction(): Promise<AccountActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAccounts(user)) throw new Error("Forbidden");
  const count = await seedDefaultAccounts(user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "account", entityId: "bulk-seed", summary: `Seeded ${count} default account(s)` });
  revalidate();
  return { ok: true };
}
