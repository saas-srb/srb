import "server-only";
import { DATA_PANELS, hasLevel } from "@/lib/ai/agent/access";
import type { ActionDef, AgentUser, EntityDef, Level, ReportDef } from "@/lib/ai/agent/types";
import { PMS_ENTITIES, PMS_ACTIONS, PMS_REPORTS } from "@/lib/ai/agent/entities/pms";
import { HRMS_ENTITIES, HRMS_ACTIONS, HRMS_REPORTS } from "@/lib/ai/agent/entities/hrms";
import { LMS_ENTITIES, LMS_ACTIONS, LMS_REPORTS } from "@/lib/ai/agent/entities/lms";
import { FMS_ENTITIES, FMS_ACTIONS, FMS_REPORTS } from "@/lib/ai/agent/entities/fms";
import { TMS_ENTITIES, TMS_ACTIONS, TMS_REPORTS } from "@/lib/ai/agent/entities/tms";
import { PRMS_ENTITIES, PRMS_ACTIONS, PRMS_REPORTS } from "@/lib/ai/agent/entities/prms";
import { SMMS_ENTITIES, SMMS_ACTIONS } from "@/lib/ai/agent/entities/smms";
import { SOP_ENTITIES, SOP_ACTIONS, SOP_REPORTS } from "@/lib/ai/agent/entities/sop";
import { DLMS_ENTITIES, DLMS_ACTIONS } from "@/lib/ai/agent/entities/dlms";
import { SEO_ENTITIES, SEO_ACTIONS, SEO_REPORTS } from "@/lib/ai/agent/entities/seo";
import { OTS_ENTITIES, OTS_ACTIONS, OTS_REPORTS } from "@/lib/ai/agent/entities/ots";
import { LPMS_ENTITIES, LPMS_ACTIONS } from "@/lib/ai/agent/entities/lpms";
import { AIBOTS_ENTITIES, AIBOTS_ACTIONS } from "@/lib/ai/agent/entities/aibots";
import { MESSENGER_ENTITIES, MESSENGER_ACTIONS, MESSENGER_REPORTS } from "@/lib/ai/agent/entities/messenger";
import { INTELLIGENCE_ENTITIES, INTELLIGENCE_ACTIONS, INTELLIGENCE_REPORTS } from "@/lib/ai/agent/entities/intelligence";
import { WORKSPACE_ENTITIES, WORKSPACE_ACTIONS, WORKSPACE_REPORTS } from "@/lib/ai/agent/entities/workspace";
import { PLATFORM_ACTIONS, PLATFORM_REPORTS } from "@/lib/ai/agent/entities/platform";
import { SUPPORT_ACTIONS, SUPPORT_REPORTS } from "@/lib/ai/agent/entities/support";
import { PORTAL_ACTIONS, PORTAL_REPORTS } from "@/lib/ai/agent/entities/portal";
import { CMS_EXTRA_ENTITIES, CMS_EXTRA_ACTIONS, CMS_EXTRA_REPORTS } from "@/lib/ai/agent/entities/cms-extra";
import { OTHER_ENTITIES } from "@/lib/ai/agent/entities/others";

const ENTITIES: EntityDef[] = [...PMS_ENTITIES, ...HRMS_ENTITIES, ...LMS_ENTITIES, ...FMS_ENTITIES, ...TMS_ENTITIES, ...PRMS_ENTITIES, ...SMMS_ENTITIES, ...SOP_ENTITIES, ...DLMS_ENTITIES, ...SEO_ENTITIES, ...OTS_ENTITIES, ...LPMS_ENTITIES, ...AIBOTS_ENTITIES, ...MESSENGER_ENTITIES, ...INTELLIGENCE_ENTITIES, ...WORKSPACE_ENTITIES, ...CMS_EXTRA_ENTITIES, ...OTHER_ENTITIES];
const ACTIONS: ActionDef[] = [...HRMS_ACTIONS, ...FMS_ACTIONS, ...PMS_ACTIONS, ...LMS_ACTIONS, ...TMS_ACTIONS, ...PRMS_ACTIONS, ...SMMS_ACTIONS, ...SOP_ACTIONS, ...DLMS_ACTIONS, ...SEO_ACTIONS, ...OTS_ACTIONS, ...LPMS_ACTIONS, ...AIBOTS_ACTIONS, ...MESSENGER_ACTIONS, ...INTELLIGENCE_ACTIONS, ...WORKSPACE_ACTIONS, ...PLATFORM_ACTIONS, ...SUPPORT_ACTIONS, ...PORTAL_ACTIONS, ...CMS_EXTRA_ACTIONS];
const REPORTS: ReportDef[] = [...PMS_REPORTS, ...HRMS_REPORTS, ...LMS_REPORTS, ...FMS_REPORTS, ...TMS_REPORTS, ...PRMS_REPORTS, ...SOP_REPORTS, ...SEO_REPORTS, ...OTS_REPORTS, ...MESSENGER_REPORTS, ...INTELLIGENCE_REPORTS, ...WORKSPACE_REPORTS, ...PLATFORM_REPORTS, ...SUPPORT_REPORTS, ...PORTAL_REPORTS, ...CMS_EXTRA_REPORTS];

/** Which products a given assistant spans: its own, or (from the workspace) every data product. */
export function scopePanels(panel: string): string[] {
  return panel === "hub" || panel === "workspace" ? [...DATA_PANELS, "workspace", "support"] : [panel];
}

const need = (l: Level | undefined, d: Level): Level => l ?? d;

/** What this person may do with an entity: everything its levels allow, or just their own rows, or nothing (null). */
async function resolve(user: AgentUser, e: EntityDef): Promise<EntityDef | null> {
  if (e.scope) {
    const always = await e.scope(user);
    if (!always) return null;
    const inner = await resolveLevels(user, { ...e, scope: undefined });
    return inner ? { ...inner, baseFilter: inner.baseFilter ? { $and: [inner.baseFilter, always] } : always } : null;
  }
  return resolveLevels(user, e);
}

async function resolveLevels(user: AgentUser, e: EntityDef): Promise<EntityDef | null> {
  if (user.blockedPanels?.includes(e.panel)) return null;
  if (hasLevel(user.roles, e.panel, need(e.read, "staff")) && (e.allowRead ? e.allowRead(user) : true)) return e;
  if (!e.self || !hasLevel(user.roles, e.panel, "any")) return null;
  const mine = await e.self(user);
  if (!mine) return null;
  return { ...e, baseFilter: e.baseFilter ? { $and: [e.baseFilter, mine] } : mine, write: e.selfWrite ? "any" : false, canDelete: e.selfWrite ? e.canDelete : false };
}

export async function entitiesFor(user: AgentUser, panel: string): Promise<EntityDef[]> {
  const panels = new Set(scopePanels(panel));
  const out: EntityDef[] = [];
  for (const e of ENTITIES) {
    if (!panels.has(e.panel)) continue;
    const r = await resolve(user, e);
    if (r) out.push(r);
  }
  return out;
}

export function actionsFor(user: AgentUser, panel: string): ActionDef[] {
  const panels = new Set(scopePanels(panel));
  if (user.readOnly) return [];
  return ACTIONS.filter((a) => panels.has(a.panel) && !user.blockedPanels?.includes(a.panel) && hasLevel(user.roles, a.panel, a.level) && (a.allow ? a.allow(user) : true));
}

export function canWrite(user: AgentUser, e: EntityDef): boolean {
  return !user.readOnly && !user.blockedPanels?.includes(e.panel) && !!e.write && hasLevel(user.roles, e.panel, e.write) && (e.allow ? e.allow(user) : true);
}

export function reportsFor(user: AgentUser, panel: string): ReportDef[] {
  const panels = new Set(scopePanels(panel));
  return REPORTS.filter((r) => panels.has(r.panel) && !user.blockedPanels?.includes(r.panel) && hasLevel(user.roles, r.panel, r.level) && (r.allow ? r.allow(user) : true));
}

export const actionByKey = (user: AgentUser, panel: string, key: string) => actionsFor(user, panel).find((a) => a.key === key);
