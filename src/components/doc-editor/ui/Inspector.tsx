"use client";

import { useId, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { AI_MODES, CALLOUT_VARIANTS, CONDITION_OPS, FIELD_KINDS, PARTY_ROLES, VARIABLE_FORMATS, VARIABLE_NAMESPACES } from "@/lib/products/playbook-ai/doc/types";
import { PBDOC_LIMITS, IDENT_RE } from "@/lib/products/playbook-ai/doc/limits";
import { isValidVariableKey, type VariableDef } from "@/components/doc-editor/core/variables";
import { inspectorTarget, type Target } from "@/components/doc-editor/ui/target";
import { addColumn, addRow, removeColumn, removeRow, setColumnWidths, setTableHeaderRow, tableShape, type CommandResult } from "@/components/doc-editor/ui/commands";

type Attrs = Record<string, unknown>;
interface Field {
  name: string;
  label: string;
  kind: "text" | "select" | "number" | "bool" | "varKey" | "ident";
  options?: readonly (readonly [string, string])[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  required?: boolean;
  optional?: boolean;
  help?: string;
  when?: (a: Attrs) => boolean;
}
const opt = (list: readonly string[], labels: Record<string, string> = {}) => list.map((v) => [v, labels[v] ?? v] as const);
const NEEDS_VALUE = (a: Attrs) => ["eq", "neq", "gt", "lt"].includes(String(a.op));

const TITLES: Record<string, string> = {
  callout: "Callout", conditional: "Conditional block", repeat: "Repeat block", section: "Section", signatureBlock: "Signature block", image: "Image", toc: "Table of contents",
  spacer: "Spacer", clause: "Clause", orderedList: "Numbered list", table: "Table", variable: "Variable", placeholder: "Fill-in field", field: "Document field", heading: "Heading",
};

const FIELDS: Record<string, Field[]> = {
  callout: [{ name: "variant", label: "Style", kind: "select", options: opt(CALLOUT_VARIANTS, { info: "Information", warning: "Warning", important: "Important" }) }],
  conditional: [
    { name: "key", label: "Show only when this variable", kind: "varKey" },
    { name: "op", label: "Condition", kind: "select", options: opt(CONDITION_OPS, { eq: "equals", neq: "does not equal", exists: "has a value", not_exists: "has no value", gt: "is greater than", lt: "is less than" }) },
    { name: "value", label: "Value", kind: "text", maxLength: PBDOC_LIMITS.maxConditionValue, required: true, when: NEEDS_VALUE },
  ],
  repeat: [
    { name: "source", label: "List to repeat over", kind: "varKey" },
    { name: "itemVar", label: "Name for each item", kind: "ident", help: "Use it inside the block as, for example, item.name" },
  ],
  section: [
    { name: "title", label: "Title", kind: "text", maxLength: PBDOC_LIMITS.maxTitle, required: true },
    { name: "key", label: "Key", kind: "ident", help: "Stable name used by templates and AI. Lower-case letters, digits and underscores." },
    { name: "aiMode", label: "How the AI treats it", kind: "select", options: opt(AI_MODES, { fixed: "Fixed text", generate: "AI writes from facts", table: "AI fills a table", facts: "Variables only" }) },
    { name: "locked", label: "Locked (reviewed text, AI cannot change it)", kind: "bool" },
  ],
  signatureBlock: [
    { name: "label", label: "Label", kind: "text", maxLength: PBDOC_LIMITS.maxLabel, required: true },
    { name: "partyRole", label: "Signs as", kind: "select", options: opt(PARTY_ROLES, { company_signatory: "Company signatory", counterparty: "Counterparty", witness: "Witness", approver: "Approver" }) },
    { name: "showName", label: "Printed name line", kind: "bool" },
    { name: "showDesignation", label: "Designation line", kind: "bool" },
    { name: "showDate", label: "Date line", kind: "bool" },
  ],
  image: [
    { name: "alt", label: "Description (alt text)", kind: "text", maxLength: PBDOC_LIMITS.maxAlt, required: true },
    { name: "widthPct", label: "Width (%)", kind: "number", min: 5, max: 100, step: 5 },
    { name: "align", label: "Alignment", kind: "select", options: opt(["left", "center", "right"]) },
    { name: "caption", label: "Caption", kind: "text", maxLength: PBDOC_LIMITS.maxCaption, optional: true },
  ],
  toc: [{ name: "levels", label: "Heading levels to list", kind: "number", min: 1, max: 4, step: 1 }],
  spacer: [{ name: "heightMm", label: "Height (mm)", kind: "number", min: 1, max: PBDOC_LIMITS.maxSpacerMm, step: 1 }],
  clause: [
    { name: "level", label: "Level (1., 1.1, (a))", kind: "select", options: [["1", "1. Main clause"], ["2", "1.1 Sub-clause"], ["3", "(a) Item"]] },
    { name: "numbered", label: "Numbered", kind: "bool" },
  ],
  orderedList: [
    { name: "style", label: "Numbering", kind: "select", options: [["decimal", "1. 2. 3."], ["alpha", "a. b. c."], ["roman", "i. ii. iii."]] },
    { name: "start", label: "Start at", kind: "number", min: 1, max: 9999, step: 1, optional: true },
  ],
  variable: [
    { name: "key", label: "Variable", kind: "varKey" },
    { name: "format", label: "Show as", kind: "select", options: [["", "Text as is"], ...opt(VARIABLE_FORMATS.filter((f) => f !== "text"), { upper: "UPPER CASE", date: "Date (dd/mm/yyyy)", money: "Rupees (lakh/crore grouping)", number: "Number", words: "Amount in words" })] },
    { name: "fallback", label: "If it has no value, show", kind: "text", maxLength: PBDOC_LIMITS.maxFallback, optional: true },
  ],
  placeholder: [
    { name: "label", label: "Field name", kind: "text", maxLength: PBDOC_LIMITS.maxLabel, required: true },
    { name: "hint", label: "Hint for the person filling it", kind: "text", maxLength: PBDOC_LIMITS.maxHint, optional: true },
  ],
  field: [{ name: "field", label: "Shows", kind: "select", options: opt(FIELD_KINDS, { pageNumber: "Page number", totalPages: "Total pages", docNumber: "Document number", version: "Version", date: "Date", title: "Title" }) }],
};

function FieldRow({ f, value, onCommit, defs }: { f: Field; value: unknown; onCommit: (v: unknown) => void; defs: VariableDef[] }) {
  const id = useId();
  const initial = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setDraft(initial); }
  const err = (() => {
    if (f.kind === "varKey") return !draft ? "Required." : !isValidVariableKey(draft) ? `Use a name such as ${VARIABLE_NAMESPACES[0]}.name` : null;
    if (f.kind === "ident") return !IDENT_RE.test(draft) ? "Lower-case letters, digits and underscores, starting with a letter." : (f.name === "itemVar" && (VARIABLE_NAMESPACES as readonly string[]).includes(draft)) ? "That name is reserved." : null;
    if (f.kind === "text" && f.required && !draft.trim()) return "Required.";
    if (f.kind === "number") {
      if (draft === "" && f.optional) return null;
      const n = Number(draft);
      return !Number.isFinite(n) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity) ? `Enter a number from ${f.min} to ${f.max}.` : null;
    }
    return null;
  })();
  const cls = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm aria-invalid:border-destructive";
  const commit = (v: string) => {
    if (err) return;
    if (f.kind === "number") onCommit(v === "" ? null : Number(v));
    else if (f.optional || f.name === "format") onCommit(v === "" ? null : v);
    else onCommit(f.name === "level" ? Number(v) : v);
  };
  if (f.kind === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onCommit(e.target.checked)} />
        {f.label}
      </label>
    );
  }
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">{f.label}</label>
      {f.kind === "select" ? (
        <select id={id} className={cls} value={initial} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}>
          {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <>
          <input
            id={id} className={cls} aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : undefined}
            type={f.kind === "number" ? "number" : "text"} min={f.min} max={f.max} step={f.step} maxLength={f.maxLength}
            list={f.kind === "varKey" ? `${id}-keys` : undefined} value={draft}
            onChange={(e) => { setDraft(e.target.value); if (f.kind === "number" || f.kind === "text") { const ok = f.kind === "number" ? true : !(f.required && !e.target.value.trim()); if (ok && f.kind === "text") commit(e.target.value); } }}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(draft); }}
          />
          {f.kind === "varKey" && <datalist id={`${id}-keys`}>{defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</datalist>}
        </>
      )}
      {err && <p id={`${id}-e`} role="alert" className="text-xs text-destructive">{err}</p>}
      {f.help && !err && <p className="text-xs text-muted-foreground">{f.help}</p>}
    </div>
  );
}

function TableTools({ editor, node }: { editor: Editor; node: Target["node"] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const shape = useEditorState({ editor, selector: ({ editor: e }) => tableShape(e) });
  const widths = (node.attrs.colWidths as number[] | null) ?? [];
  const [draft, setDraft] = useState(widths.join(", "));
  const widthsKey = widths.join(", ");
  const [prevWidths, setPrevWidths] = useState(widthsKey);
  if (prevWidths !== widthsKey) { setPrevWidths(widthsKey); setDraft(widthsKey); }
  const run = (r: CommandResult) => setMsg(r.ok ? null : r.message);
  const b = (label: string, fn: () => CommandResult) => <Button type="button" size="xs" variant="outline" onClick={() => run(fn())}>{label}</Button>;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(node.attrs.headerRow)} onChange={(e) => setTableHeaderRow(editor, e.target.checked)} /> First row is a header
      </label>
      <div className="flex flex-wrap gap-1.5">
        {b("Row above", () => addRow(editor, "before"))}{b("Row below", () => addRow(editor, "after"))}{b("Delete row", () => removeRow(editor))}
        {b("Column left", () => addColumn(editor, "before"))}{b("Column right", () => addColumn(editor, "after"))}{b("Delete column", () => removeColumn(editor))}
        <Button type="button" size="xs" variant="destructive" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="pb-colw">Column widths (%), left to right{shape ? `: ${shape.cols} columns` : ""}</label>
        <input id="pb-colw" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const ws = draft.split(/[,\s]+/).filter(Boolean).map(Number); if (ws.length !== (shape?.cols ?? 0)) return setMsg(`Enter ${shape?.cols ?? 0} numbers.`); run(setColumnWidths(editor, ws)); }} />
        <p className="text-xs text-muted-foreground">Cells cannot be merged: tables stay a simple grid so Word and PDF match.</p>
      </div>
      {msg && <p role="alert" className="text-xs text-destructive">{msg}</p>}
    </div>
  );
}

export default function Inspector({ editor, defs, readOnly }: { editor: Editor; defs: VariableDef[]; readOnly: boolean }) {
  const target = useEditorState({ editor, selector: ({ editor: e }) => { const t = inspectorTarget(e.state); return t ? { name: t.node.type.name, pos: t.pos, attrs: t.node.attrs as Attrs } : null; } });
  if (!target) return <p className="p-3 text-sm text-muted-foreground">Click a callout, table, image, section, condition, signature block or variable to change its settings here.</p>;
  const fields = (FIELDS[target.name] ?? []).filter((f) => !f.when || f.when(target.attrs));
  const update = (patch: Attrs) => {
    editor.chain().command(({ tr, state }) => {
      const n = state.doc.nodeAt(target.pos);
      if (!n || n.type.name !== target.name) return false;
      tr.setNodeMarkup(target.pos, undefined, { ...n.attrs, ...patch });
      return true;
    }).run();
  };
  const node = editor.state.doc.nodeAt(target.pos);
  return (
    <fieldset disabled={readOnly} className="space-y-3 p-3">
      <legend className="sr-only">{TITLES[target.name] ?? "Block"} settings</legend>
      <h3 className="text-sm font-semibold">{TITLES[target.name] ?? target.name}{target.name === "heading" ? ` ${String(target.attrs.level)}` : ""}</h3>
      {target.name === "heading" && (
        <FieldRow f={{ name: "level", label: "Level", kind: "select", options: [["1", "Heading 1"], ["2", "Heading 2"], ["3", "Heading 3"], ["4", "Heading 4"]] }} value={target.attrs.level} defs={defs} onCommit={(v) => update({ level: v })} />
      )}
      {fields.map((f) => <FieldRow key={f.name} f={f} value={f.name === "level" && target.name === "clause" ? String(target.attrs.level) : target.attrs[f.name]} defs={defs} onCommit={(v) => update({ [f.name]: v })} />)}
      {target.name === "table" && node && <TableTools editor={editor} node={node} />}
      {target.name === "conditional" && !NEEDS_VALUE(target.attrs) && <p className="text-xs text-muted-foreground">This block appears only when the condition is true. There is no code: just the variable and the comparison.</p>}
    </fieldset>
  );
}
