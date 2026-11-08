"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { removeLoss, saveLoss } from "@/lib/products/cashflow-ai/income-tax/losses-store";

type Result = { ok: true } | { ok: false; error: string };

// Every action re-checks the permission: hiding a button on the page is not the boundary.
async function guard(): Promise<{ error: string; actor?: undefined } | { actor: { id: string; email: string | null }; error?: undefined }> {
  const user = await getCurrentFmsUser();
  if (!user) return { error: "Please sign in again." };
  if (!canManageCompliance(user)) return { error: "You do not have permission to change the losses register." };
  return { actor: { id: user.id, email: user.email } };
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const done = (res: Result): Result => {
  if (res.ok) revalidatePath("/cashflow-ai/income-tax", "layout");
  return res;
};

export async function saveLossAction(id: unknown, input: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (id !== null && str(id, 100) === null) return { ok: false, error: "Loss not found." };
  const i = (input ?? {}) as Record<string, unknown>;
  const fy = str(i.fy, 10), kind = str(i.kind, 40), amount = num(i.amount), available = num(i.available);
  if (fy === null || kind === null || amount === null || available === null) return { ok: false, error: "Fill in the year, kind, original amount and amount still available." };
  if (i.validUntilFy != null && str(i.validUntilFy, 10) === null) return { ok: false, error: "The last year it can be used must look like 2032-33." };
  if (i.note != null && str(i.note, 500) === null) return { ok: false, error: "Keep the note under 500 characters." };
  return done(await saveLoss(id as string | null, { fy, kind: kind as never, amount, available, validUntilFy: (i.validUntilFy as string | null | undefined) ?? null, note: (i.note as string | null | undefined) ?? null }, g.actor));
}

export async function removeLossAction(id: unknown): Promise<Result> {
  const g = await guard();
  if (!g.actor) return { ok: false, error: g.error ?? "Not allowed." };
  if (typeof id !== "string" || !id || id.length > 100) return { ok: false, error: "Loss not found." };
  return done(await removeLoss(id, g.actor));
}
