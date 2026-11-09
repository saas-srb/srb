/** The real library documents the Brand page can preview the letterhead with. Pure, client-safe. */
export type PreviewKind = "document" | "sop" | "kpi";
export const BRAND_PREVIEW_ITEMS: readonly { id: string; label: string; kind: PreviewKind }[] = [
  { id: "ct.msa", label: "Master services agreement", kind: "document" },
  { id: "hr.offer", label: "Offer letter", kind: "document" },
  { id: "ct.nda_mutual", label: "Mutual NDA", kind: "document" },
  { id: "ct.employment", label: "Employment agreement", kind: "document" },
  { id: "hr.experience", label: "Experience letter", kind: "document" },
  { id: "hr.leave_policy", label: "Leave policy", kind: "document" },
  { id: "it.security_policy", label: "Information security policy", kind: "document" },
  { id: "sop.hr.recruitment", label: "SOP: Recruitment and selection", kind: "sop" },
  { id: "kpi.sales-executive", label: "KPI sheet: Sales Executive", kind: "kpi" },
];
export const DEFAULT_PREVIEW_ITEM = BRAND_PREVIEW_ITEMS[0].id;

