"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { groupVariables, placeholderKey, type VariableDef } from "@/components/doc-editor/core/variables";

interface Props {
  defs: VariableDef[];
  onInsertVariable: (key: string) => void;
  onInsertPlaceholder: (label: string, hint: string) => void;
}

/** Search the registry and insert a variable chip, or create a fill-in field the user must complete before export. */
export default function VariablePicker({ defs, onInsertVariable, onInsertPlaceholder }: Props) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"variables" | "fill">("variables");
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const groups = useMemo(() => groupVariables(defs, q), [defs, q]);
  const key = placeholderKey(label);
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="What to insert" className="flex gap-1 rounded-lg bg-muted p-0.5 text-sm">
        {([["variables", "Variables"], ["fill", "Fill-in field"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`flex-1 rounded-md px-2 py-1 ${tab === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {tab === "variables" ? (
        <>
          <input autoFocus type="search" aria-label="Search variables" placeholder="Search variables" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" />
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {groups.length === 0 && <p className="text-sm text-muted-foreground">{defs.length === 0 ? "No variables are configured yet." : "No variable matches."}</p>}
            {groups.map((g) => (
              <section key={g.group} aria-label={g.group}>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</h4>
                <ul className="space-y-0.5">
                  {g.items.map((d) => (
                    <li key={d.key}>
                      <button type="button" onClick={() => onInsertVariable(d.key)} className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:bg-muted">
                        <span>{d.label}</span>
                        <code className="truncate text-xs text-muted-foreground">{`{{${d.key}}}`}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (key) onInsertPlaceholder(label, hint); }}>
          <p className="text-xs text-muted-foreground">A fill-in field is highlighted in the document. The document cannot be exported as final while any remain empty.</p>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="pb-ph-label">Field name</label>
          <input id="pb-ph-label" autoFocus value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" placeholder="Joining date" />
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="pb-ph-hint">Hint (optional)</label>
          <input id="pb-ph-hint" value={hint} maxLength={300} onChange={(e) => setHint(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" />
          {key && <p className="text-xs text-muted-foreground">Stored as <code>{`{{${key}}}`}</code></p>}
          <Button type="submit" disabled={!key} size="sm">Insert field</Button>
        </form>
      )}
    </div>
  );
}
