"use server";

import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { loadPersonForEdit } from "@/lib/products/commandos/people";
import type { AccessMap } from "@/lib/access/types";

/** The access a person has been given (to save it as a template). A Director has no bundle to save. */
export async function loadAccessOfPersonAction(userId: string): Promise<AccessMap | null> {
  await requireWorkspaceAction("company.users");
  const p = await loadPersonForEdit(String(userId ?? ""));
  if (!p || p.isDirector) return null;
  return Object.keys(p.picked).length ? p.picked : null;
}
