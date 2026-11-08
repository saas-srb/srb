"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { isMonth } from "@/lib/products/cashflow-ai/gst/core";
import { MAX_FILE_BYTES } from "@/lib/products/cashflow-ai/gst/gstr2b-core";
import { saveGstr2bUpload } from "@/lib/products/cashflow-ai/gst/gstr2b-store";

export type UploadResult = { ok: true; message: string } | { ok: false; error: string };

// The layout only lets people who may view the books in; loading a file for a month needs the compliance permission, checked again here.
export async function uploadGstr2bAction(fd: FormData): Promise<UploadResult> {
  const user = await getCurrentFmsUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!canManageCompliance(user)) return { ok: false, error: "You do not have permission to upload GSTR-2B." };
  const month = fd.get("month");
  if (typeof month !== "string" || !isMonth(month)) return { ok: false, error: "Choose a month." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a GSTR-2B file (JSON or CSV)." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
  const res = await saveGstr2bUpload({ month, fileName: file.name, text }, { id: user.id, email: user.email });
  if (!res.ok) return res;
  revalidatePath("/cashflow-ai/gst/reconcile");
  return {
    ok: true,
    message: `${res.rows} invoice${res.rows === 1 ? "" : "s"} loaded${res.notes ? `, ${res.notes} credit/debit note${res.notes === 1 ? "" : "s"}` : ""}${res.rejectedCount ? `, ${res.rejectedCount} row${res.rejectedCount === 1 ? "" : "s"} could not be read` : ""}${res.replaced ? ". The earlier upload for this month was replaced." : "."}`,
  };
}
