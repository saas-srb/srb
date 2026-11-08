/**
 * PBDoc v1: the canonical Playbook document model. Pure types, client-safe.
 *
 * One typed JSON tree is what the editor stores, what AI emits, what versions freeze and hash, and what the PDF and DOCX renderers read.
 * It is NOT HTML. Anything the renderers cannot draw cannot be expressed here (no raw HTML, no arbitrary CSS, no merged table cells in v1,
 * no floating images, no per-run fonts). Every block carries a stable `id` (comments, diffs and AI citations point at ids; a future
 * collaboration layer could too).
 */

import type { PageSettings } from "@/lib/products/playbook-ai/doc/page";

export const PBDOC_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Marks (inline formatting)
// ---------------------------------------------------------------------------

/** Named colours resolved by the renderers from the company brand, never raw hex values. */
export const TEXT_COLORS = ["default", "muted", "primary", "accent", "red", "green", "blue"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "sup" }
  | { type: "sub" }
  | { type: "link"; href: string }
  | { type: "highlight"; color: HighlightColor }
  | { type: "color"; color: TextColor };
export type MarkType = Mark["type"];

// ---------------------------------------------------------------------------
// Inline nodes
// ---------------------------------------------------------------------------

export const VARIABLE_FORMATS = ["text", "upper", "date", "money", "number", "words"] as const;
export type VariableFormat = (typeof VARIABLE_FORMATS)[number];

/** Namespaces a variable key may start with. `custom` is the company's own variables. */
export const VARIABLE_NAMESPACES = ["company", "author", "employee", "candidate", "client", "vendor", "project", "party", "doc", "date", "input", "custom"] as const;
export type VariableNamespace = (typeof VARIABLE_NAMESPACES)[number];

export const FIELD_KINDS = ["pageNumber", "totalPages", "docNumber", "version", "date", "title"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export type InlineNode =
  | { type: "text"; text: string; marks?: Mark[] }
  /** A value from company or party data. Renders its resolved value; `fallback` shows when it has none. */
  | { type: "var"; key: string; format?: VariableFormat; fallback?: string; marks?: Mark[] }
  /** The only permitted gap: data the user must supply. Highlighted in the editor; export is blocked while any remain (unless exported as a draft). */
  | { type: "placeholder"; key: string; label: string; hint?: string }
  /** Page number, total pages, document number, version, date or title. Meaningful in headers and footers (and allowed in the body). */
  | { type: "field"; field: FieldKind; marks?: Mark[] }
  | { type: "hardBreak" };

export type Align = "left" | "center" | "right" | "justify";
export const ALIGNS: readonly Align[] = ["left", "center", "right", "justify"];

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export const LIST_STYLES = ["decimal", "alpha", "roman"] as const;
export type ListStyle = (typeof LIST_STYLES)[number];

export const CALLOUT_VARIANTS = ["info", "warning", "important"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const PARTY_ROLES = ["company_signatory", "counterparty", "witness", "approver"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const AI_MODES = ["fixed", "generate", "table", "facts"] as const;
/** fixed = boilerplate, no AI. generate = AI writes from facts. table = AI fills rows from supplied data. facts = variables only. */
export type AiMode = (typeof AI_MODES)[number];

export const CONDITION_OPS = ["eq", "neq", "exists", "not_exists", "gt", "lt"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
/** A structured condition. There is no expression language and nothing is ever evaluated as code. */
export interface Condition {
  key: string;
  op: ConditionOp;
  value?: string;
}

export interface ParagraphBlock { id: string; type: "paragraph"; content: InlineNode[]; align?: Align }
export interface HeadingBlock { id: string; type: "heading"; level: 1 | 2 | 3 | 4; content: InlineNode[]; align?: Align }
/** A legal clause. `level` 1..3 numbers as 1. / 1.1 / (a) at render time; `numbered: false` is an unnumbered clause body. */
export interface ClauseBlock { id: string; type: "clause"; level: 1 | 2 | 3; numbered: boolean; content: InlineNode[] }
export interface ListItem { id: string; content: ListItemChild[] }
export type ListItemChild = ParagraphBlock | BulletListBlock | OrderedListBlock;
export interface BulletListBlock { id: string; type: "bulletList"; items: ListItem[] }
export interface OrderedListBlock { id: string; type: "orderedList"; style: ListStyle; start?: number; items: ListItem[] }
export type CellChild = ParagraphBlock | BulletListBlock | OrderedListBlock;
export interface TableCell { id: string; content: CellChild[]; align?: Align }
export interface TableRow { id: string; cells: TableCell[] }
/** `colWidths` are percentages and sum to 100. The first row is a header row when `headerRow` is true. No merged cells in v1. */
export interface TableBlock { id: string; type: "table"; colWidths: number[]; headerRow: boolean; rows: TableRow[] }
export interface ImageBlock { id: string; type: "image"; fileId: string; alt: string; widthPct: number; align: "left" | "center" | "right"; caption?: string }
export interface CalloutBlock { id: string; type: "callout"; variant: CalloutVariant; content: CellChild[] }
/** Layout marker only: a line with a printed name, designation and date. Playbook never captures a signature (ContractFlow does). */
export interface SignatureBlock {
  id: string;
  type: "signatureBlock";
  label: string;
  partyRole: PartyRole;
  showName: boolean;
  showDesignation: boolean;
  showDate: boolean;
}
export interface PageBreakBlock { id: string; type: "pageBreak" }
export interface DividerBlock { id: string; type: "divider" }
export interface SpacerBlock { id: string; type: "spacer"; heightMm: number }
export interface TocBlock { id: string; type: "toc"; levels: 1 | 2 | 3 | 4 }
export interface ConditionalBlock { id: string; type: "conditional"; when: Condition; children: ContentBlock[] }
export interface RepeatBlock { id: string; type: "repeat"; source: string; itemVar: string; children: ContentBlock[] }
export interface SectionBlock {
  id: string;
  type: "section";
  /** Stable key for template-defined sections ("scope", "compensation"); AI regeneration and diffs address sections by key. */
  key: string;
  title: string;
  aiMode: AiMode;
  /** Locked sections (boilerplate reviewed by a lawyer) cannot be edited or regenerated by AI. */
  locked: boolean;
  children: ContentBlock[];
}

/** Blocks that can sit directly in the body or inside a section / conditional / repeat. */
export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ClauseBlock
  | BulletListBlock
  | OrderedListBlock
  | TableBlock
  | ImageBlock
  | CalloutBlock
  | SignatureBlock
  | PageBreakBlock
  | DividerBlock
  | SpacerBlock
  | TocBlock
  | ConditionalBlock
  | RepeatBlock
  | SectionBlock;

/** Blocks allowed in a header or footer. */
export type ZoneBlock = ParagraphBlock | ImageBlock | DividerBlock | TableBlock;

export type AnyBlock = ContentBlock | ZoneBlock;
export type BlockType = ContentBlock["type"];

export const CONTENT_BLOCK_TYPES: readonly BlockType[] = [
  "paragraph", "heading", "clause", "bulletList", "orderedList", "table", "image", "callout", "signatureBlock",
  "pageBreak", "divider", "spacer", "toc", "conditional", "repeat", "section",
];
export const ZONE_BLOCK_TYPES = ["paragraph", "image", "divider", "table"] as const;

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** Language of the document. English only for now; the type is a union so adding a language is a data change. */
export type DocLang = "en";

export interface PBDoc {
  schemaVersion: typeof PBDOC_SCHEMA_VERSION;
  lang: DocLang;
  page: PageSettings;
  header: ZoneBlock[];
  footer: ZoneBlock[];
  body: ContentBlock[];
}

export interface ValidationIssue {
  /** JSON path of the offending value, e.g. `body[3].content[0].marks[1]`. */
  path: string;
  message: string;
}
