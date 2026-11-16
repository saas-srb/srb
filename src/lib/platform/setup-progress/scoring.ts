import { GROUPS, PARTIAL_DEFAULT, TIER_WEIGHT, type Marks, type ProgressSummary, type SetupFacts, type StepDef, type StepResult, type StepState, type SetupProgress } from "@/lib/platform/setup-progress/types";

/**
 * Pure scoring. percent = weighted done / weighted applicable. Required steps weigh 3, recommended 2, optional 1; a partly done step counts a fraction;
 * "not applicable" and "could not check" steps are left out of both sides. 100% means exactly one thing: every step that applies is done.
 */
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function scoreOf(status: StepResult["status"], fraction?: number): number | null {
  if (status === "done") return 1;
  if (status === "todo") return 0;
  if (status === "partial") return clamp(fraction ?? PARTIAL_DEFAULT);
  return null;
}

/** One step's state from the facts and the marks. Never throws: a check that fails is "could not check". */
export function evaluateStep(def: StepDef, f: SetupFacts, dependencyOpen: (id: string) => boolean = () => false): StepState {
  const base = { id: def.id, group: def.group, product: def.product, title: def.title, description: def.description, why: def.why, tier: def.tier, weight: TIER_WEIGHT[def.tier], minutes: def.minutes, href: def.href, feature: def.feature, manual: Boolean(def.manual), canMarkNotApplicable: def.tier === "optional", blockedBy: (def.dependsOn ?? []).filter(dependencyOpen) };
  const out = (status: StepResult["status"], detail: string, mark: StepState["mark"] = null, fraction?: number): StepState => ({ ...base, status, detail, score: scoreOf(status, fraction), mark });

  if (def.product && !(f.modules?.on ?? []).includes(def.product) && !f.failed.includes("modules")) return out("notApplicable", "This product is not switched on for your company.");
  if (def.product && f.failed.includes("modules")) return out("unknown", "Could not check which products are on.");
  if (def.applies && !safe(() => def.applies!(f), true)) return out("notApplicable", "Nothing in your setup needs this.");
  // A Director may mark an OPTIONAL step "not applicable". Never a required or recommended one.
  const na = f.marks.notApplicable[def.id];
  if (na && def.tier === "optional") return out("notApplicable", `Marked not applicable: ${na.reason}`, "notApplicable");
  const unavailable = def.needs.find((g) => f.failed.includes(g) || f[g as keyof SetupFacts] === undefined);
  if (def.manual) {
    const r = f.marks.reviewed[def.id];
    if (r) return out("done", `Reviewed on ${r.at.slice(0, 10)}.`, "reviewed");
    if (!unavailable) {
      const res = tryCheck(def, f);
      return out(res.status, res.detail, null, res.fraction);
    }
    return out("todo", "Open it, check it fits how you work, then mark it reviewed.");
  }
  if (unavailable) return out("unknown", "Could not check this right now. It will be checked again shortly.");
  const res = tryCheck(def, f);
  return out(res.status, res.detail, null, res.fraction);
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}
function tryCheck(def: StepDef, f: SetupFacts): StepResult {
  try { return def.check(f); } catch { return { status: "unknown", detail: "Could not check this right now." }; }
}

/** All steps, in registry order, with each step's state. Dependencies only annotate; they never change the status. */
export function evaluateAll(defs: StepDef[], f: SetupFacts): StepState[] {
  const states = new Map<string, StepState>();
  const open = (id: string) => { const s = states.get(id); return !!s && s.status !== "done" && s.status !== "notApplicable"; };
  for (const d of defs) states.set(d.id, evaluateStep(d, f));
  // second pass so a dependency declared later in the list is known
  for (const d of defs) states.set(d.id, evaluateStep(d, f, open));
  return defs.map((d) => states.get(d.id)!);
}

export function summarize(steps: StepState[], defs: StepDef[]): ProgressSummary {
  const counted = steps.filter((s) => s.score !== null);
  const total = counted.reduce((n, s) => n + s.weight, 0);
  const got = counted.reduce((n, s) => n + s.weight * (s.score ?? 0), 0);
  const unknown = steps.filter((s) => s.status === "unknown").length;
  const allDone = counted.every((s) => s.status === "done");
  const raw = total === 0 ? 1 : got / total;
  // Exactly 100 only when everything that applies is done and everything could be checked; otherwise never above 99.
  const percent = allDone && unknown === 0 ? 100 : Math.min(99, Math.floor(raw * 100));
  const pct = (list: StepState[]) => {
    const c = list.filter((s) => s.score !== null);
    const t = c.reduce((n, s) => n + s.weight, 0);
    if (t === 0) return 100;
    const all = c.every((s) => s.status === "done");
    return all ? 100 : Math.min(99, Math.floor((c.reduce((n, s) => n + s.weight * (s.score ?? 0), 0) / t) * 100));
  };
  const count = (list: StepState[]) => ({ done: list.filter((s) => s.status === "done").length, applicable: list.filter((s) => s.score !== null).length });
  const minutesLeft = Math.round(counted.reduce((n, s) => n + s.minutes * (1 - (s.score ?? 0)), 0));
  void defs;
  return {
    percent,
    complete: percent === 100,
    applicable: counted.length,
    done: steps.filter((s) => s.status === "done").length,
    partial: steps.filter((s) => s.status === "partial").length,
    todo: steps.filter((s) => s.status === "todo").length,
    notApplicable: steps.filter((s) => s.status === "notApplicable").length,
    unknown,
    minutesLeft,
    groups: GROUPS.map((g) => { const list = steps.filter((s) => s.group === g.key); return { key: g.key, title: g.title, percent: pct(list), ...count(list) }; }).filter((g) => g.applicable > 0),
    products: [...new Set(steps.filter((s) => s.product).map((s) => s.product!))].map((module) => { const list = steps.filter((s) => s.product === module); return { module, percent: pct(list), ...count(list) }; }).filter((p) => p.applicable > 0),
  };
}

/** The next best steps: unfinished, counted, nothing blocking them, required first, then by weight and the least time. */
export function nextSteps(steps: StepState[], n = 3): StepState[] {
  const order = { required: 0, recommended: 1, optional: 2 } as const;
  return steps
    .filter((s) => (s.status === "todo" || s.status === "partial") && s.blockedBy.length === 0)
    .sort((a, b) => order[a.tier] - order[b.tier] || (b.status === "partial" ? 1 : 0) - (a.status === "partial" ? 1 : 0) || a.minutes - b.minutes)
    .slice(0, n);
}

export function buildProgress(defs: StepDef[], f: SetupFacts): SetupProgress {
  const steps = evaluateAll(defs, f);
  return { steps, summary: summarize(steps, defs), next: nextSteps(steps), computedAt: f.now.toISOString() };
}

export type { Marks };
