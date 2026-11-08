"use client";

import { createContext, useContext } from "react";
import type { LmsPermission } from "@/lib/lms-roles";

/**
 * What the signed-in person may do in the CRM, computed on the server (`lmsCan`) and handed to client components so they
 * hide what isn't theirs. Hiding is only a courtesy — every action and route re-checks on the server. Outside the CRM
 * layout (the CMS pages reuse a few components) there is no provider and nothing is hidden: those pages guard themselves.
 */
const LmsAccessContext = createContext<ReadonlySet<LmsPermission> | null>(null);

export function LmsAccessProvider({ allowed, children }: { allowed: LmsPermission[]; children: React.ReactNode }) {
  return <LmsAccessContext.Provider value={new Set(allowed)}>{children}</LmsAccessContext.Provider>;
}

export function useLmsCan(permission: LmsPermission): boolean {
  const set = useContext(LmsAccessContext);
  return set === null ? true : set.has(permission);
}
