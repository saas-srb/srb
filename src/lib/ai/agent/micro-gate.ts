import "server-only";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { MICRO, microByKey } from "@/lib/access/micro";
import type { AgentUser, Json } from "@/lib/ai/agent/types";

/**
 * The agent's access decisions for products that are finished on micro features. The engine asks the same question the screens ask: does this
 * person hold the feature (and at the level it needs)? The person's access subject travels on `AgentUser`; a user without one holds nothing here.
 * A closure made by this file carries `micro: true`; the engine refuses to offer an entity, action or report of a finished product whose gate
 * is not one of these (so a leftover role-list check can never be the only guard).
 */

/** Assistant panel -> product slug and the role-file name its old permission names came from. */
export const FINISHED_PANELS: Record<string, { product: string; source: string }> = {
  dlms: { product: "cybervault", source: "dlms" },
  seo: { product: "rankmax-ai", source: "seo" },
  aibots: { product: "agentos", source: "aibots" },
  ots: { product: "evaliq", source: "ots" },
  smms: { product: "viralpulse-ai", source: "smms" },
  lpms: { product: "contractflow-ai", source: "lpms" },
  cms: { product: "sitecraft-ai", source: "cms" },
  lms: { product: "dealflow-ai", source: "lms" },
  fms: { product: "cashflow-ai", source: "fms" },
  messenger: { product: "huddle-ai", source: "messenger" },
  hrms: { product: "talentos", source: "hrms" },
  pms: { product: "sprintos", source: "pms" },
  prms: { product: "spendiq", source: "prms" },
  tms: { product: "cohort-ai", source: "tms" },
  sop: { product: "playbook-ai", source: "sop" },
  intelligence: { product: "databrain-ai", source: "intelligence" },
};

type Gate = ((u: AgentUser) => boolean) & { micro: true };
const tag = (fn: (u: AgentUser) => boolean): Gate => Object.assign(fn, { micro: true as const });
export const isMicroGate = (fn: unknown): boolean => typeof fn === "function" && (fn as { micro?: boolean }).micro === true;

/** Does the subject hold this feature (full key `<product>.<module>.<feature>`) at the level the feature needs? */
export function holds(subject: AccessSubject | undefined, fullKey: string): boolean {
  const m = microByKey(fullKey);
  return Boolean(subject && m && accessCan(subject, m.product, fullKey, m.level));
}

/** Gate on one or more full feature keys (any one is enough). */
export const microAny = (...keys: string[]): Gate => tag((u) => keys.some((k) => holds(u.subject, k)));

/** Combine gates: any one is enough. */
export const microOr = (...gates: Gate[]): Gate => tag((u) => gates.some((g) => g(u)));

/**
 * A gate by the OLD permission name the entity file used (`can("EDIT_BOT")`): it holds when the person holds any non-scope micro feature
 * whose primary legacy capability is that permission. The micro catalogue is the source of truth for that link.
 */
export const microLegacy = (panel: string) => (perm: string): Gate => {
  const def = FINISHED_PANELS[panel];
  if (!def) throw new Error(`microLegacy: ${panel} is not a finished panel`);
  const wanted = `${def.source}.${perm}`;
  const linked = MICRO.filter((m) => m.product === def.product && m.kind !== "scope" && m.legacy[0] === wanted);
  // A permission that has a Write feature means "change something": only the Write features count, so a Read only person never passes a write gate.
  const keys = (linked.some((m) => m.level === "write") ? linked.filter((m) => m.level === "write") : linked).map((m) => m.key);
  return tag((u) => keys.some((k) => holds(u.subject, k)));
};

/** Row scope for a read entity: everything when the person holds the feature, nothing otherwise. Decided from the person's own access. */
export const featureScope = (fullKey: string) => async (u: AgentUser): Promise<Json | null> => (holds(u.subject, fullKey) ? {} : { _id: "__none__" });

/** Row scope by the OLD permission name: everything when the person holds the matching feature, nothing otherwise. */
export const legacyScope = (panel: string) => (perm: string) => {
  const gate = microLegacy(panel)(perm);
  return async (u: AgentUser): Promise<Json | null> => (gate(u) ? {} : { _id: "__none__" });
};
