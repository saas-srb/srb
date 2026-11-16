import type { StepState } from "@/lib/platform/setup-progress/types";

export type SetupShow = "all" | "todo" | "done";
export interface SetupFilter { q: string; show: SetupShow }

export function readSetupFilter(sp: Record<string, string | string[] | undefined>): SetupFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const show = one(sp.show);
  return { q: one(sp.q).trim().slice(0, 80), show: show === "todo" || show === "done" ? show : "all" };
}

/** To do = everything still open (to do, in progress, could not check); Done = done and not applicable are listed apart from the open work. Search matches title and sentence. */
export function filterSteps(steps: StepState[], f: SetupFilter): StepState[] {
  const q = f.q.toLowerCase();
  return steps.filter((s) => {
    if (q && !`${s.title} ${s.description}`.toLowerCase().includes(q)) return false;
    if (f.show === "todo") return s.status === "todo" || s.status === "partial" || s.status === "unknown";
    if (f.show === "done") return s.status === "done" || s.status === "notApplicable";
    return true;
  });
}

export const STATUS_CHIP: Record<StepState["status"], string> = { done: "Done", partial: "In progress", todo: "To do", notApplicable: "Not applicable", unknown: "Could not check" };
