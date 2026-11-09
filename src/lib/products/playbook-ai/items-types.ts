/**
 * The three kinds of Playbook items (SOP, Document, Employee KPI sheet) share one store (`pb_documents`) and one set of screens.
 * Pure, client-safe: no database and no server-only imports.
 */

export const ITEM_KINDS = ["sop", "document", "kpi"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const isItemKind = (v: unknown): v is ItemKind => typeof v === "string" && (ITEM_KINDS as readonly string[]).includes(v);

export interface ItemKindInfo {
  kind: ItemKind;
  /** URL segment under /playbook-ai (and /contractflow-ai for the lists there). */
  segment: "sops" | "documents" | "kpis";
  plural: string;
  singular: string;
  mine: string;
  library: string;
  create: string;
  /** Prefix of the legal-style document title block ("Standard Operating Procedure"). */
  docLabel: string;
}

export const ITEM_KIND_INFO: Record<ItemKind, ItemKindInfo> = {
  sop: { kind: "sop", segment: "sops", plural: "SOPs", singular: "SOP", mine: "My SOPs", library: "SOP Library", create: "Create SOP", docLabel: "Standard Operating Procedure" },
  document: { kind: "document", segment: "documents", plural: "Documents", singular: "Document", mine: "My Documents", library: "Document Library", create: "Create document", docLabel: "Document" },
  kpi: { kind: "kpi", segment: "kpis", plural: "Employee KPIs", singular: "KPI sheet", mine: "My KPI sheets", library: "KPI Library", create: "Create KPI sheet", docLabel: "Employee KPI Sheet" },
};

export const kindFromSegment = (s: string): ItemKind | null => ITEM_KINDS.find((k) => ITEM_KIND_INFO[k].segment === s) ?? null;

/** What the wizard collects in step 1 and what the document layouts print in the control table. Stored on the item (additive). */
export interface ItemMeta {
  department?: string;
  designation?: string;
  description?: string;
  /** KPI sheets: the period the sheet covers ("Quarterly", "FY 2026-27"). */
  reviewPeriod?: string;
  /** The library entry it was copied from, if any. */
  libraryId?: string;
}

export const cleanItemMeta = (v: unknown): ItemMeta => {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  const s = (k: string, max: number): string | undefined => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, max) : undefined);
  const out: ItemMeta = {};
  const d = s("department", 120), g = s("designation", 120), t = s("description", 2000), r = s("reviewPeriod", 80), l = s("libraryId", 80);
  if (d) out.department = d;
  if (g) out.designation = g;
  if (t) out.description = t;
  if (r) out.reviewPeriod = r;
  if (l) out.libraryId = l;
  return out;
};

/** A prebuilt library entry (listing fields only; the content is built on demand by the library module). */
export interface LibraryEntryInfo {
  id: string;
  kind: ItemKind;
  title: string;
  category: string;
  summary: string;
  /** Needs review by a qualified advocate (legal document types). */
  legal?: boolean;
  /** Two or three key inputs or sections, shown as small chips. */
  tags?: string[];
}

/** Where an item's latest copy stands in ContractFlow (derived from the clone, so it can never disagree with ContractFlow). */
export const SEND_STATES = ["clone_draft", "ready", "sent", "viewed", "partially_signed", "signed", "declined", "expired", "voided"] as const;
export type SendState = (typeof SEND_STATES)[number];

export const SEND_STATE_LABEL: Record<SendState, string> = {
  clone_draft: "In ContractFlow (draft)",
  ready: "Ready to send",
  sent: "Sent",
  viewed: "Viewed",
  partially_signed: "Partly signed",
  signed: "Signed",
  declined: "Rejected",
  expired: "Expired",
  voided: "Voided",
};

export interface ItemSendInfo {
  cloneId: string;
  state: SendState;
  partyName: string;
  at: string;
  /** More than one copy has been sent. */
  copies: number;
}

/** A row of "My items". Dates are ISO strings so the row can cross to a client component. */
export interface ItemRow {
  id: string;
  title: string;
  kind: ItemKind;
  department: string;
  designation: string;
  status: string;
  updatedAt: string;
  updatedBy: string;
  versionCount: number;
  send: ItemSendInfo | null;
}
