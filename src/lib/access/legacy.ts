import * as admin from "@/lib/admin-roles";
import * as aibots from "@/lib/aibots-roles";
import * as cms from "@/lib/cms-roles";
import * as dlms from "@/lib/dlms-roles";
import * as fms from "@/lib/fms-roles";
import * as hrms from "@/lib/hrms-roles";
import * as intelligence from "@/lib/intelligence-roles";
import * as lms from "@/lib/lms-roles";
import * as lpms from "@/lib/lpms-roles";
import * as messenger from "@/lib/messenger-roles";
import * as ots from "@/lib/ots-roles";
import * as playbook from "@/lib/playbook-roles";
import * as pms from "@/lib/pms-roles";
import * as portal from "@/lib/portal-roles";
import * as prms from "@/lib/prms-roles";
import * as seo from "@/lib/seo-roles";
import * as smms from "@/lib/smms-roles";
import * as sop from "@/lib/sop-roles";
import * as tms from "@/lib/tms-roles";
import * as workspace from "@/lib/workspace-roles";
import { CATALOGUE } from "./catalogue.generated";
import type { CatalogueEntry } from "./types";

/**
 * The legacy side: the 20 role files, called exactly as the products call them today. The adapter uses them
 * as the ORACLE: a legacy user (roles + permission overrides) is derived from a person's access map, and the
 * derived user is checked against the legacy functions themselves, so the two can never silently disagree.
 */
const MODS: Record<string, Record<string, unknown>> = {
  admin, aibots, cms, dlms, fms, hrms, intelligence, lms, lpms, messenger, ots, playbook, pms, portal, prms, seo, smms, sop, tms, workspace,
};

export interface LegacyUser {
  roles: readonly string[];
  permissionOverrides?: Record<string, boolean> | null;
}

/** What the legacy code answers for this feature and this user. */
export function legacyAnswer(e: CatalogueEntry, user: LegacyUser): boolean {
  const fn = MODS[e.source]?.[e.fn] as ((...a: unknown[]) => unknown) | undefined;
  if (typeof fn !== "function") return false;
  try {
    if (e.kind === "perm") return Boolean(fn(user, e.perm));
    if (e.kind === "tier") return Boolean(fn([...user.roles]));
    return Boolean(fn(user));
  } catch {
    return false;
  }
}

export function legacyAnswers(user: LegacyUser, entries: CatalogueEntry[] = CATALOGUE): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const e of entries) out[e.key] = legacyAnswer(e, user);
  return out;
}
