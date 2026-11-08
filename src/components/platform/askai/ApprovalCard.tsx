"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/lib/ai/agent/types";
import { STRINGS, type UiLang } from "@/components/platform/askai/i18n";

/** What the agent wants to change, laid out for a decision. Nothing happens until Approve; deletions need a second confirmation. */
export default function ApprovalCard({ proposal, busy, onDecide, autoApprove, onAutoApprove, lang }: {
  lang: UiLang;
  proposal: Proposal;
  busy: boolean;
  onDecide: (decision: "approve" | "reject", opts: { confirmed: boolean }) => void;
  autoApprove: boolean;
  onAutoApprove: (v: boolean) => void;
}) {
  const T = STRINGS[lang];
  const [confirmed, setConfirmed] = useState(false);
  const risky = proposal.needsExtraConfirm;
  return (
    <div className={cn("mt-2 space-y-3 rounded-xl border p-3", risky ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
        {risky ? <ShieldAlert className="size-4 text-destructive" /> : <Check className="size-4 text-primary" />}
        {T.needsApproval}
      </p>
      <ul className="space-y-2">
        {proposal.calls.map((c) => (
          <li key={c.id} className="rounded-lg border border-border/60 bg-background p-2.5">
            <p className={cn("text-sm font-semibold", c.destructive && "text-destructive")}>{c.title}</p>
            {c.fields.length > 0 && (
              <dl className="mt-1.5 space-y-1 text-xs">
                {c.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-[7.5rem_1fr] gap-2">
                    <dt className="truncate text-muted-foreground" title={f.label}>{f.label}</dt>
                    <dd className="min-w-0 break-words font-medium text-foreground">
                      {f.before !== undefined && f.before !== f.value ? (
                        <span className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground line-through">{f.before}</span><ArrowRight className="size-3 shrink-0" /><span>{f.value}</span></span>
                      ) : f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
      {risky && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5 size-3.5 accent-destructive" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {T.confirmCheck}
        </label>
      )}
      {!risky && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5 size-3.5" checked={autoApprove} onChange={(e) => onAutoApprove(e.target.checked)} />
          {T.autoApprove}
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy || (risky && !confirmed)} onClick={() => onDecide("approve", { confirmed })} className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50", risky ? "bg-destructive" : "bg-primary")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{risky ? T.confirmDo : T.approve}
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide("reject", { confirmed: false })} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
          <X className="size-4" />{T.notNow}
        </button>
      </div>
    </div>
  );
}
