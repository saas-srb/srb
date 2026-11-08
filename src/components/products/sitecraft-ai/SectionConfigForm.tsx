"use client";

import { useId, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CMS_ICON_KEYS } from "@/lib/products/sitecraft-ai/icon-map";
import MediaPicker from "@/components/products/sitecraft-ai/MediaPicker";
import type { SectionTypeDef, FieldSpec, RepeaterFieldSpec, ObjectFieldSpec } from "@/lib/products/sitecraft-ai/section-registry";

type Json = Record<string, unknown>;

/**
 * One generic form that edits any section's config, driven entirely by the
 * type's `fields`/`repeaters`/`objectFields` metadata in the registry —
 * rather than a bespoke hand-built form per section type.
 */
export default function SectionConfigForm({
  def,
  value,
  onChange,
}: {
  /** Any field layout — a section type's, or a collection's (`{ fields }`). */
  def: Pick<SectionTypeDef, "fields" | "repeaters" | "objectFields">;
  value: Json;
  onChange: (next: Json) => void;
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      {def.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
      {def.objectFields?.map((o) => (
        <ObjectFieldEditor key={o.key} spec={o} value={(value[o.key] as Json) ?? {}} onChange={(v) => set(o.key, v)} />
      ))}
      {def.repeaters?.map((r) => (
        <RepeaterEditor key={r.key} spec={r} value={(value[r.key] as Json[]) ?? []} onChange={(v) => set(r.key, v)} />
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  // useId, not the field key: the same field renders once per repeater item, and ids must stay unique for <Label htmlFor>.
  const id = `field-${field.key}-${useId()}`;
  const [pickerOpen, setPickerOpen] = useState(false);
  if (field.kind === "dictionary") {
    const dict = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
    return (
      <details className="rounded-xl border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">{field.label} ({Object.keys(dict).length})</summary>
        <div className="mt-3 space-y-3">
          {Object.entries(dict).map(([key, text]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`${id}-${key}`} className="font-mono text-[11px] text-muted-foreground">{key}</Label>
              <Textarea id={`${id}-${key}`} rows={text.length > 80 ? 3 : 1} value={text} onChange={(e) => onChange({ ...dict, [key]: e.target.value })} />
            </div>
          ))}
        </div>
      </details>
    );
  }
  if (field.kind === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{field.label}</Label>
        <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
      </div>
    );
  }
  if (field.kind === "number") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input id={id} type="number" value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
      </div>
    );
  }
  if (field.kind === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} rows={3} />
      </div>
    );
  }
  if (field.kind === "icon") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Select value={typeof value === "string" && value ? value : undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choose an icon" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {CMS_ICON_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (field.kind === "group") {
    // A nested object with its own fields (e.g. a job's salary block).
    const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
    return <ObjectFieldEditor spec={{ key: field.key, label: field.label, itemFields: field.fields ?? [] }} value={obj} onChange={onChange} />;
  }
  if (field.kind === "items") {
    // A list of nested objects — renders the same repeater used at the top level, recursively.
    return <RepeaterEditor spec={{ key: field.key, label: field.label, itemFields: field.fields ?? [] }} value={Array.isArray(value) ? (value as Json[]) : []} onChange={onChange} />;
  }
  if (field.kind === "select") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Select value={typeof value === "string" && value ? value : undefined} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (field.kind === "list") {
    // One item per line; stored as string[]. Blank lines are dropped on save by the type's parse().
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label} <span className="font-normal text-muted-foreground">(one per line)</span></Label>
        <Textarea id={id} value={Array.isArray(value) ? value.join("\n") : ""} onChange={(e) => onChange(e.target.value.split("\n"))} rows={4} />
      </div>
    );
  }
  if (field.kind === "image") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <div className="flex gap-2">
          <Input id={id} type="url" placeholder="https://…" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <ImageIcon className="size-3.5" /> Browse
          </Button>
        </div>
        <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onChange} />
      </div>
    );
  }
  // "text" | "url"
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Input id={id} type={field.kind === "url" ? "url" : "text"} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A blank item for a repeater: empty strings, lists and nested structures, matching each field's kind. */
function emptyFor(fields: FieldSpec[]): Json {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.kind === "list" || f.kind === "items" ? [] : f.kind === "boolean" ? false : f.kind === "group" ? emptyFor(f.fields ?? []) : f.kind === "dictionary" ? {} : f.kind === "number" ? 0 : "",
    ])
  );
}

function ObjectFieldEditor({ spec, value, onChange }: { spec: ObjectFieldSpec; value: Json; onChange: (v: Json) => void }) {
  return (
    <div className="rounded-xl border border-border/60 p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">{spec.label}</p>
      <div className="space-y-4">
        {spec.itemFields.map((f) => (
          <FieldInput key={f.key} field={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} />
        ))}
      </div>
    </div>
  );
}

function RepeaterEditor({ spec, value, onChange }: { spec: RepeaterFieldSpec; value: Json[]; onChange: (v: Json[]) => void }) {
  const items = Array.isArray(value) ? value : [];

  const updateItem = (index: number, next: Json) => onChange(items.map((it, i) => (i === index ? next : it)));
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));
  const addItem = () => onChange([...items, emptyFor(spec.itemFields)]);
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {spec.label} <span className="font-normal text-muted-foreground">({items.length})</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-border/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move down">
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeItem(index)} aria-label="Remove">
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {spec.itemFields.map((f) => (
                <FieldInput key={f.key} field={f} value={item[f.key]} onChange={(v) => updateItem(index, { ...item, [f.key]: v })} />
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
      </div>
    </div>
  );
}
