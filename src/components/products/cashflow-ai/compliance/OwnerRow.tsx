"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveOwnerAction } from "@/app/(products)/cashflow-ai/(protected)/compliance/actions";

const input = "mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:opacity-70";

export default function OwnerRow({
  workstreamKey,
  title,
  primaryRole,
  reviewRole,
  primary,
  reviewer,
  contact,
  canManage,
}: {
  workstreamKey: string;
  title: string;
  primaryRole: string;
  reviewRole: string;
  primary: string;
  reviewer: string;
  contact: string;
  canManage: boolean;
}) {
  const [vals, setVals] = useState({ primary, reviewer, contact });
  const [saved, setSaved] = useState({ primary, reviewer, contact });
  const [pending, start] = useTransition();

  function commit(field: "primary" | "reviewer" | "contact") {
    if (vals[field] === saved[field]) return;
    const value = vals[field];
    start(async () => {
      try {
        const res = await saveOwnerAction(workstreamKey, { [field]: value });
        if (res.ok) setSaved((s) => ({ ...s, [field]: value.trim() }));
        else {
          setVals((v) => ({ ...v, [field]: saved[field] }));
          toast.error(res.error);
        }
      } catch {
        setVals((v) => ({ ...v, [field]: saved[field] }));
        toast.error("Could not save. Please try again.");
      }
    });
  }

  return (
    <li className="space-y-2 border-b border-border/40 py-4 last:border-0">
      <div className="text-sm font-medium">{title}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Does the work <span className="opacity-70">({primaryRole})</span>
          <input className={input} value={vals.primary} maxLength={120} disabled={!canManage || pending} onChange={(e) => setVals({ ...vals, primary: e.target.value })} onBlur={() => commit("primary")} placeholder="Name of person or firm" />
        </label>
        <label className="text-xs text-muted-foreground">
          Reviews / supports <span className="opacity-70">({reviewRole})</span>
          <input className={input} value={vals.reviewer} maxLength={120} disabled={!canManage || pending} onChange={(e) => setVals({ ...vals, reviewer: e.target.value })} onBlur={() => commit("reviewer")} placeholder="Name of person or firm" />
        </label>
        <label className="text-xs text-muted-foreground">
          Phone / email
          <input className={input} value={vals.contact} maxLength={160} disabled={!canManage || pending} onChange={(e) => setVals({ ...vals, contact: e.target.value })} onBlur={() => commit("contact")} />
        </label>
      </div>
    </li>
  );
}
