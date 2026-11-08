/**
 * Authoring helpers for catalogue templates. Pure, client-safe.
 *
 * Templates are written as readable text with a tiny inline syntax, and compiled to raw (id-less) PBDoc blocks that the PBDoc parser
 * validates and assigns ids to:
 *   {{employee.full_name}}            a variable          {{input.ctc|money}}   with a format (text upper date money number words)
 *   {{input.notice|number|a notice period}}   with a fallback (third part)
 *   [[input.reason|Reason|Why this is being issued]]   a placeholder (key|label|hint)
 *   **bold**                          bold text           a newline inside text is a line break
 * Nothing here evaluates code; the output is plain data.
 */

import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import type {
  AiInstructions, FooterLayout, HeaderLayout, InputField, LayoutTokens, PickerNamespace, RawBlock, RowColumn, SelectOption, ShowWhen,
  TemplateSection,
} from "@/lib/products/playbook-ai/catalogue/types";

// ---------------------------------------------------------------------------
// Inline text
// ---------------------------------------------------------------------------

type Mark = { type: string };
type Inline = Record<string, unknown>;

const TOKEN = /(\*\*[^*]+\*\*|\{\{[^}]+\}\}|\[\[[^\]]+\]\]|\n)/g;

/** Compiles the inline syntax to PBDoc inline nodes. Exported for tests. */
export function inline(text: string, marks: Mark[] = []): Inline[] {
  const out: Inline[] = [];
  const withMarks = (n: Inline): Inline => (marks.length ? { ...n, marks } : n);
  for (const part of text.split(TOKEN)) {
    if (part === "") continue;
    if (part === "\n") out.push({ type: "hardBreak" });
    else if (part.startsWith("**") && part.endsWith("**") && part.length > 4) out.push(...inline(part.slice(2, -2), [...marks.filter((m) => m.type !== "bold"), { type: "bold" }]));
    else if (part.startsWith("{{") && part.endsWith("}}")) {
      const [key, format, ...fb] = part.slice(2, -2).split("|").map((s) => s.trim());
      const fallback = fb.join("|");
      out.push(withMarks({ type: "var", key, ...(format ? { format } : {}), ...(fallback ? { fallback } : {}) }));
    } else if (part.startsWith("[[") && part.endsWith("]]")) {
      const [key, label, hint] = part.slice(2, -2).split("|").map((s) => s.trim());
      out.push({ type: "placeholder", key, label: label || key, ...(hint ? { hint } : {}) });
    } else out.push(withMarks({ type: "text", text: part }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Align = "left" | "center" | "right" | "justify";

export const p = (text: string, align?: Align): RawBlock => ({ type: "paragraph", content: inline(text), ...(align ? { align } : {}) });
export const h = (level: 1 | 2 | 3 | 4, text: string, align?: Align): RawBlock => ({ type: "heading", level, content: inline(text), ...(align ? { align } : {}) });
/** A numbered legal clause: level 1 is "1.", level 2 "1.1", level 3 "(a)". */
export const clause = (level: 1 | 2 | 3, text: string): RawBlock => ({ type: "clause", level, numbered: true, content: inline(text) });
/** Continuation text under a clause, not numbered. */
export const plainClause = (level: 1 | 2 | 3, text: string): RawBlock => ({ type: "clause", level, numbered: false, content: inline(text) });
export const c1 = (text: string) => clause(1, text);
export const c2 = (text: string) => clause(2, text);
export const c3 = (text: string) => clause(3, text);

const listItems = (items: string[]) => items.map((t) => ({ content: [p(t)] }));
export const bullets = (items: string[]): RawBlock => ({ type: "bulletList", items: listItems(items) });
export const numbered = (items: string[], style: "decimal" | "alpha" | "roman" = "decimal"): RawBlock => ({ type: "orderedList", style, items: listItems(items) });

/** A table. Cells use the inline syntax. The header row is bold. `widths` are percentages. */
export function table(widths: number[], header: string[] | null, rows: string[][], aligns?: Align[]): RawBlock {
  const cell = (t: string, col: number, bold: boolean) => ({
    content: [{ type: "paragraph", content: inline(bold ? `**${t}**` : t) }],
    ...(aligns?.[col] && aligns[col] !== "left" ? { align: aligns[col] } : {}),
  });
  const body = rows.map((r) => ({ cells: r.map((t, i) => cell(t, i, false)) }));
  const head = header ? [{ cells: header.map((t, i) => cell(t, i, true)) }] : [];
  return { type: "table", colWidths: widths, headerRow: !!header, rows: [...head, ...body] };
}

/** A two-column label / value table with no header row. */
export const kv = (rows: [string, string][], widths: [number, number] = [38, 62]): RawBlock =>
  table(widths, null, rows.map(([k, v]) => [`**${k}**`, v]));

export const callout = (variant: "info" | "warning" | "important", text: string): RawBlock => ({ type: "callout", variant, content: [p(text)] });
export const divider = (): RawBlock => ({ type: "divider" });
export const spacer = (heightMm = 8): RawBlock => ({ type: "spacer", heightMm });
export const pageBreak = (): RawBlock => ({ type: "pageBreak" });

type PartyRole = "company_signatory" | "counterparty" | "witness" | "approver";
export const sig = (label: string, partyRole: PartyRole, o: { designation?: boolean; date?: boolean } = {}): RawBlock => ({
  type: "signatureBlock", label, partyRole, showName: true, showDesignation: o.designation ?? true, showDate: o.date ?? true,
});

export type Op = "eq" | "neq" | "exists" | "not_exists" | "gt" | "lt";
export const when = (key: string, op: Op, value: string | undefined, children: RawBlock[]): RawBlock => ({
  type: "conditional", when: value === undefined ? { key, op } : { key, op, value }, children,
});
export const whenSet = (key: string, children: RawBlock[]) => when(key, "exists", undefined, children);
export const whenYes = (key: string, children: RawBlock[]) => when(key, "eq", "yes", children);
export const whenNo = (key: string, children: RawBlock[]) => when(key, "eq", "no", children);
export const each = (source: string, itemVar: string, children: RawBlock[]): RawBlock => ({ type: "repeat", source, itemVar, children });

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const fixedSection = (key: string, title: string, body: RawBlock[], o: { locked?: boolean; dependsOn?: string[] } = {}): TemplateSection => ({
  key, title, aiMode: "fixed", locked: o.locked ?? false, body, ...(o.dependsOn ? { dependsOn: o.dependsOn } : {}),
});
/** Static legal wording: fixed and locked. */
export const lockedSection = (key: string, title: string, body: RawBlock[]): TemplateSection => fixedSection(key, title, body, { locked: true });
export const aiSection = (key: string, title: string, body: RawBlock[], ai: AiInstructions, o: { dependsOn?: string[] } = {}): TemplateSection => ({
  key, title, aiMode: "ai", locked: false, ai, body, ...(o.dependsOn ? { dependsOn: o.dependsOn } : {}),
});
export const hybridSection = (key: string, title: string, body: RawBlock[], ai: AiInstructions, o: { dependsOn?: string[] } = {}): TemplateSection => ({
  key, title, aiMode: "hybrid", locked: false, ai, body, ...(o.dependsOn ? { dependsOn: o.dependsOn } : {}),
});

/** Default AI instructions; callers override what differs. Every AI section must say what it may use and what it must never invent. */
export function ai(brief: string, allowedFacts: string[], neverInvent: string[], o: Partial<Pick<AiInstructions, "tone" | "minWords" | "maxWords">> = {}): AiInstructions {
  return { tone: o.tone ?? "formal", minWords: o.minWords ?? 40, maxWords: o.maxWords ?? 160, brief, allowedFacts, neverInvent };
}

/** The things AI must never invent in an HR document; combine with section-specific entries. */
export const NEVER_HR = [
  "names, dates, amounts, percentages or numbers that are not in the provided facts",
  "statutory entitlements, rates or limits (take them only from the user's inputs or say 'as per applicable law')",
  "company policies or clauses that are not in the template or the inputs",
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

type Opts = Partial<Omit<InputField, "key" | "label" | "type">>;
const field = (type: InputField["type"], key: string, label: string, o: Opts = {}): InputField => ({ key, label, type, required: o.required ?? true, ...o });

export const f = {
  text: (key: string, label: string, o?: Opts) => field("text", key, label, o),
  longtext: (key: string, label: string, o?: Opts) => field("longtext", key, label, o),
  number: (key: string, label: string, o?: Opts) => field("number", key, label, o),
  money: (key: string, label: string, o?: Opts) => field("money", key, label, o),
  date: (key: string, label: string, o?: Opts) => field("date", key, label, o),
  yesno: (key: string, label: string, o?: Opts) => field("yesno", key, label, { defaultValue: "no", ...o }),
  select: (key: string, label: string, options: Array<string | SelectOption>, o?: Opts) =>
    field("select", key, label, { options: options.map((x) => (typeof x === "string" ? { value: x, label: x } : x)), ...o }),
  multiselect: (key: string, label: string, options: Array<string | SelectOption>, o?: Opts) =>
    field("multiselect", key, label, { options: options.map((x) => (typeof x === "string" ? { value: x, label: x } : x)), ...o }),
  person: (key: string, label: string, picker: PickerNamespace, o?: Opts) => field("person", key, label, { picker, ...o }),
  rows: (key: string, label: string, columns: RowColumn[], o?: Opts) => field("rows", key, label, { columns, minRows: 1, ...o }),
};
export const col = (key: string, label: string, type: RowColumn["type"] = "text", required = true): RowColumn => ({ key, label, type, required });
export const showWhen = (key: string, equals: string): ShowWhen => ({ key, equals });

// ---------------------------------------------------------------------------
// Layout, header and footer
// ---------------------------------------------------------------------------

export const LETTER_LAYOUT: LayoutTokens = { header: "letterhead", footer: "doc_number_page", titleAlign: "center" };
export const POLICY_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "center" };
export const FORM_LAYOUT: LayoutTokens = { header: "compact", footer: "page_numbers", titleAlign: "left" };

/** Header zone blocks for a header layout token. Variables are the company's own; unresolved ones are reported by the missing-data check. */
export function headerBlocks(token: HeaderLayout): RawBlock[] {
  if (token === "none") return [];
  if (token === "letterhead") {
    return [
      { type: "paragraph", align: "center", content: inline("**{{company.legal_name|upper}}**") },
      { type: "paragraph", align: "center", content: inline("{{company.address}}") },
      { type: "divider" },
    ];
  }
  return [{ type: "paragraph", content: inline("**{{company.name}}**") }, { type: "divider" }];
}

export function footerBlocks(token: FooterLayout): RawBlock[] {
  const centre = (content: Inline[]): RawBlock => ({ type: "paragraph", align: "center", content });
  const page = [{ type: "text", text: "Page " }, { type: "field", field: "pageNumber" }, { type: "text", text: " of " }, { type: "field", field: "totalPages" }];
  switch (token) {
    case "none": return [];
    case "page_numbers": return [{ type: "divider" }, centre(page)];
    case "doc_number_page": return [{ type: "divider" }, centre([{ type: "field", field: "docNumber" }, { type: "text", text: "  |  " }, ...page])];
    case "confidential_page": return [{ type: "divider" }, centre([{ type: "text", text: "Confidential  |  " }, { type: "field", field: "docNumber" }, { type: "text", text: "  |  " }, ...page])];
  }
}

export const DEFAULT_TEMPLATE_PAGE = DEFAULT_PAGE;
