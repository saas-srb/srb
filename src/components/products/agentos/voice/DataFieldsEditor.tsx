"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { DATA_FIELD_LIMITS, type DataField } from "@/lib/products/agentos/calls/purposes";
import { addField, fieldProblems, missingSuggestions, moveField, parseOptions, removeField, setFieldType, slugKey, updateField, withSuggestions } from "@/lib/products/agentos/calls/data-field-editor";

const TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
  { value: "choice", label: "One of a list" },
];

let counter = 0;
const nextId = () => `row-${++counter}`;

function OptionsInput({ initial, onChange, disabled, id }: { initial: string[]; onChange: (o: string[]) => void; disabled?: boolean; id: string }) {
  // The text is kept here (not derived from the list) so typing a new line or a trailing comma isn't swallowed.
  const [text, setText] = useState(initial.join("\n"));
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={id}>Answers to choose from (one per line)</Label>
      <Textarea id={id} rows={3} value={text} disabled={disabled} onChange={(e) => { setText(e.target.value); onChange(parseOptions(e.target.value)); }} />
      <p className="text-[11px] text-muted-foreground">At least two. The agent records exactly one of these. Up to {DATA_FIELD_LIMITS.optionsMax}.</p>
    </div>
  );
}

/**
 * What the agent should find out on every call. Each row becomes a data-collection question on the agent; the answers are saved on
 * the call and shown with these labels. Rows are suggested from the chosen purposes and every one can be changed or removed.
 */
export default function DataFieldsEditor({ fields, purposes, onChange, disabled }: { fields: DataField[]; purposes: string[]; onChange: (next: DataField[]) => void; disabled?: boolean }) {
  // Stable ids per row so reordering or removing keeps each row's own typing state.
  const [ids, setIds] = useState<string[]>(() => fields.map(() => nextId()));
  const idAt = (i: number) => ids[i] ?? `row-pos-${i}`;
  const allIds = fields.map((_, i) => idAt(i));
  const problems = fieldProblems(fields);
  const missing = missingSuggestions(fields, purposes);

  const apply = (next: DataField[], nextIds: string[]) => {
    setIds(nextIds);
    onChange(next);
  };
  const add = () => apply(addField(fields), [...allIds, nextId()]);
  const remove = (i: number) => apply(removeField(fields, i), allIds.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => {
    const to = i + d;
    if (to < 0 || to >= fields.length) return;
    const nextIds = [...allIds];
    [nextIds[i], nextIds[to]] = [nextIds[to], nextIds[i]];
    apply(moveField(fields, i, d), nextIds);
  };
  const suggest = () => {
    const next = withSuggestions(fields, purposes);
    apply(next, [...allIds, ...next.slice(fields.length).map(() => nextId())]);
  };
  const setLabel = (i: number, label: string) => {
    const f = fields[i];
    const others = fields.filter((_, j) => j !== i).map((x) => x.key);
    // The key follows the name until the person edits the key themselves.
    const follows = f.key === slugKey(f.label || "field", others);
    onChange(updateField(fields, i, follows ? { label, key: slugKey(label || "field", others) } : { label }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {missing.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={disabled || fields.length >= DATA_FIELD_LIMITS.max}>
            <Sparkles className="size-3.5" />Add {missing.length} suggested field{missing.length === 1 ? "" : "s"} for the chosen purposes
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled || fields.length >= DATA_FIELD_LIMITS.max}><Plus className="size-3.5" />Add a field</Button>
        <span className="text-[11px] text-muted-foreground">{fields.length} / {DATA_FIELD_LIMITS.max}</span>
      </div>

      {fields.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-3 text-xs text-muted-foreground"><ListPlus className="size-4" />Nothing is collected yet. Tick a call purpose for suggestions, or add your own fields.</p>
      ) : (
        <ol className="space-y-3">
          {fields.map((f, i) => {
            const rid = allIds[i];
            return (
              <li key={rid} className="rounded-2xl border border-border/50 bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${rid}-label`}>Name</Label>
                    <Input id={`${rid}-label`} maxLength={DATA_FIELD_LIMITS.labelMax} value={f.label} disabled={disabled} onChange={(e) => setLabel(i, e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${rid}-key`}>Key</Label>
                    <Input id={`${rid}-key`} maxLength={DATA_FIELD_LIMITS.keyMax} value={f.key} disabled={disabled} className="font-mono text-xs" onChange={(e) => onChange(updateField(fields, i, { key: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${rid}-type`}>Kind of answer</Label>
                    <OptionSelect id={`${rid}-type`} value={f.type} options={TYPES} disabled={disabled} onChange={(t) => onChange(setFieldType(fields, i, t as DataField["type"]))} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={f.required} disabled={disabled} onChange={(e) => onChange(updateField(fields, i, { required: e.target.checked }))} />
                    Important: the agent must ask for it
                  </label>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`${rid}-desc`}>How to find the answer</Label>
                    <Textarea id={`${rid}-desc`} rows={2} maxLength={DATA_FIELD_LIMITS.descMax} value={f.description} disabled={disabled} onChange={(e) => onChange(updateField(fields, i, { description: e.target.value }))} />
                  </div>
                  {f.type === "choice" && <OptionsInput id={`${rid}-opts`} initial={f.options ?? []} disabled={disabled} onChange={(o) => onChange(updateField(fields, i, { options: o }))} />}
                </div>
                {problems[i] && <p role="alert" className="mt-2 text-[11px] text-destructive">{problems[i]}</p>}
                <div className="mt-2 flex justify-end gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move ${f.label || "field"} up`}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={disabled || i === fields.length - 1} aria-label={`Move ${f.label || "field"} down`}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove ${f.label || "field"}`}><Trash2 className="size-3.5" /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
