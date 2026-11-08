"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canViewFinancialStatements } from "@/lib/fms-roles";
import { isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { MAX_FILE_BYTES, templateCsv } from "@/lib/products/cashflow-ai/tds/credits-core";
import { saveTdsCreditsUpload } from "@/lib/products/cashflow-ai/tds/credits-store";

export type UploadResult = { ok: true; message: string } | { ok: false; error: string };
export type TemplateResult = { ok: true; filename: string; csv: string } | { ok: false; error: string };

// A server action instead of a route (one function fewer to deploy). Permissions are checked again here: the page guard does not protect
// an action that is called directly.
export async function downloadTdsCreditsTemplateAction(): Promise<TemplateResult> {
  const user = await getCurrentFmsUser();
  if (!user || !canViewFinancialStatements(user)) return { ok: false, error: "You do not have access to TDS working." };
  return { ok: true, filename: "form-26as-credits-template.csv", csv: templateCsv() };
}

export async function uploadTdsCreditsAction(fd: FormData): Promise<UploadResult> {
  const user = await getCurrentFmsUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!canManageCompliance(user)) return { ok: false, error: "You do not have permission to upload Form 26AS credits." };
  const fy = fd.get("fy");
  if (typeof fy !== "string" || !isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (!/\.csv$/i.test(file.name)) return { ok: false, error: "Only a .csv file can be read here." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
  const res = await saveTdsCreditsUpload({ fy, fileName: file.name, text }, { id: user.id, email: user.email });
  if (!res.ok) return res;
  revalidatePath("/cashflow-ai/tds/credits");
  return {
    ok: true,
    message: `${res.rows} row${res.rows === 1 ? "" : "s"} loaded${res.rejectedCount ? `, ${res.rejectedCount} row${res.rejectedCount === 1 ? "" : "s"} could not be read` : ""}${res.replaced ? ". The earlier file for this year was replaced." : "."}`,
  };
}
