"use server";

import { getCurrentHubUser } from "@/lib/hub-auth";
import { checkWorkspaceAccess } from "@/lib/products/commandos/access";
import { recentPdfActivity, type PdfActivityEntry } from "@/lib/pdf/activity";

/** The company's recent PDF activity, a page at a time. Needs only the page's own access (it works while the workspace is read-only). */
export async function loadPdfActivityAction(query: { type?: string; before?: string }): Promise<{ entries: PdfActivityEntry[]; next: string | null }> {
  const user = await getCurrentHubUser();
  if (!user || user.mustChangePassword || !(await checkWorkspaceAccess(user, "company.pdfs"))) throw new Error("Forbidden");
  const q = query && typeof query === "object" ? query : {};
  return recentPdfActivity({ type: typeof q.type === "string" ? q.type : undefined, before: typeof q.before === "string" ? q.before : undefined });
}
