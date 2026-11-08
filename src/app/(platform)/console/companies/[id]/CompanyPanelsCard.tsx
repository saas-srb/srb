"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setCompanyPanelActiveAction } from "../../products/actions";

export interface CompanyPanelRow {
  key: string;
  name: string;
  description: string;
  core: boolean;
  /** Active globally in the Product Registry. */
  globallyActive: boolean;
  /** Switched off for this company only. */
  off: boolean;
}

/** Company-specific product switches: turn a product off (or back on) for this company without touching anyone else. */
export default function CompanyPanelsCard({ companyId, rows, canManage }: { companyId: string; rows: CompanyPanelRow[]; canManage: boolean }) {
  const [state, setState] = useState(rows);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {state.map((r) => {
        const on = r.globallyActive && !r.off;
        return (
          <div key={r.key} className={cn("flex items-start gap-3 rounded-xl border border-border/50 p-3", !on && "bg-muted/40")}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">{!r.globallyActive ? "Switched off for every company" : r.off ? "Switched off for this company" : r.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${r.name} for this company`}
              disabled={!canManage || pending || r.core || !r.globallyActive}
              onClick={() =>
                start(async () => {
                  const res = await setCompanyPanelActiveAction(companyId, r.key, r.off);
                  if (!res.ok) return void toast.error(res.error);
                  setState((s) => s.map((x) => (x.key === r.key ? { ...x, off: !x.off } : x)));
                  toast.success(res.message ?? "Updated");
                })
              }
              className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-muted-foreground/30")}
            >
              <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
