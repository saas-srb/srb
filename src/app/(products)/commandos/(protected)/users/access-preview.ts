import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";

/** What a person would hold: used by the Add a person form to show the access before it is given. Mirrors `computeEffective` on the server. */
export function computeEffectiveClient(i: { director: boolean; designation?: CustomRoleView; extraRoles: string[]; extraDesignations: CustomRoleView[] }): { roles: string[]; fromDesignation: string[] } {
  if (i.director) return { roles: ["super_admin"], fromDesignation: [] };
  // Everything the chosen designations (the main one and any others) give.
  const fromDesignation = [...new Set([...(i.designation?.baseRoles ?? []), ...i.extraDesignations.flatMap((d) => d.baseRoles)])];
  const all = new Set<string>([...fromDesignation, ...i.extraRoles]);
  return { roles: [...all], fromDesignation };
}
