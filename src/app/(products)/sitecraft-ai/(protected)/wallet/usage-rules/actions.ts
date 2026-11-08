"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { validateUsageRuleInput, type UsageRuleWriteInput } from "@/lib/wallet/usage-rule-validation";
import { createUsageRule, updateUsageRule, deleteUsageRule, getUsageRule } from "@/lib/wallet/usage-rules";

async function requireLmsUser() {
  const u = await requireLmsOrCms("MANAGE_WALLET");
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function saveUsageRuleAction(id: string | null, input: Partial<UsageRuleWriteInput>): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireLmsUser();
  const v = validateUsageRuleInput(input);
  if (!v.valid) return { error: "Please fix the highlighted fields.", fieldErrors: v.errors };
  if (id) {
    if (!(await updateUsageRule(id, v.data, user.id))) return { error: "Rule not found." };
  } else {
    await createUsageRule(v.data, user.id);
  }
  revalidatePath("/sitecraft-ai/wallet/usage-rules");
  redirect("/sitecraft-ai/wallet/usage-rules");
}

export async function deleteUsageRuleAction(id: string): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  if (!(await getUsageRule(id))) return { error: "Rule not found." };
  await deleteUsageRule(id, user.id);
  revalidatePath("/sitecraft-ai/wallet/usage-rules");
  return {};
}
