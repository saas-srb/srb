/**
 * The sections the create wizard asks the AI to write, per kind. Pure and client-safe (the wizard shows these as the progress list).
 * `brief` is the section's instruction to the model; `never` lists what it must not invent. Every number must come from the details the
 * author typed: anything else is replaced by a visible placeholder by the fact guard.
 */
import type { ItemKind } from "@/lib/products/playbook-ai/items-types";

export interface ItemSectionPlan {
  key: string;
  title: string;
  brief: string;
  minWords: number;
  maxWords: number;
}

const NEVER = ["names, dates, amounts, percentages or numbers that are not in the facts", "statutory rates, limits or periods (say 'as per applicable law' or the company policy)", "company policies, systems or tools that are not in the facts"];
export const ITEM_NEVER = NEVER;

export const ITEM_SECTIONS: Record<ItemKind, ItemSectionPlan[]> = {
  sop: [
    { key: "purpose", title: "1. Purpose", brief: "State why this procedure exists and what it achieves for the company, in two or three sentences.", minWords: 30, maxWords: 90 },
    { key: "scope", title: "2. Scope and applicability", brief: "State who and what the procedure applies to, the start and end points, and what is out of scope.", minWords: 30, maxWords: 100 },
    { key: "roles", title: "3. Roles and responsibilities", brief: "A table with columns Role and Responsibility for the roles involved, derived from the department and designation.", minWords: 40, maxWords: 160 },
    { key: "definitions", title: "4. Definitions", brief: "A table with columns Term and Meaning for the terms a new reader needs.", minWords: 30, maxWords: 120 },
    { key: "procedure", title: "5. Procedure", brief: "A table with columns No., Step, Owner and Action describing the steps in order from start to finish. Each step names who does it and what is done.", minWords: 120, maxWords: 380 },
    { key: "controls", title: "6. Controls and checks", brief: "A bullet list of the checks and controls that keep the procedure correct and prevent errors or misuse.", minWords: 40, maxWords: 120 },
    { key: "records", title: "7. Records", brief: "A bullet list of the records this procedure creates and must keep.", minWords: 20, maxWords: 80 },
    { key: "measures", title: "8. Performance measures", brief: "A bullet list of how the procedure's performance is measured. Do not state numeric targets.", minWords: 20, maxWords: 80 },
    { key: "exceptions", title: "9. Exceptions and escalation", brief: "A bullet list of what to do when the procedure cannot be followed and who to escalate to.", minWords: 30, maxWords: 100 },
    { key: "references", title: "10. References", brief: "A bullet list of related policies and procedures (by name only).", minWords: 10, maxWords: 60 },
  ],
  kpi: [
    { key: "purpose", title: "1. Role purpose", brief: "Describe in two or three sentences what the role exists to achieve for the company.", minWords: 30, maxWords: 90 },
    { key: "kpis", title: "2. Key performance indicators", brief: "A table with columns KPI, Definition, Formula, Target, Weightage, Frequency and Data source for five to seven indicators. For Target write exactly 'Company to set'. Weightage values are percentages that add up to 100.", minWords: 120, maxWords: 400 },
    { key: "cadence", title: "3. Review cadence", brief: "A bullet list describing the weekly, monthly and period-end reviews between manager and employee.", minWords: 30, maxWords: 100 },
    { key: "scale", title: "4. Rating scale", brief: "A table with columns Rating and Meaning for a five-point scale from Outstanding to Unsatisfactory.", minWords: 30, maxWords: 100 },
    { key: "improvement", title: "5. Improvement plan", brief: "A bullet list describing how an improvement plan is agreed, tracked and closed for low ratings.", minWords: 30, maxWords: 100 },
  ],
  document: [
    { key: "introduction", title: "1. Introduction", brief: "Introduce the document: its subject, who it is for and why it is written, using only the details given.", minWords: 30, maxWords: 100 },
    { key: "details", title: "2. Details", brief: "The main content of the document, organised in short paragraphs, lists or a table where they fit, using only the details given.", minWords: 80, maxWords: 350 },
    { key: "conclusion", title: "3. Next steps", brief: "Close the document: the actions that follow, who owns them and how to ask questions. Do not invent dates.", minWords: 20, maxWords: 90 },
  ],
};

export const KIND_DOC_TYPE_NAME: Record<ItemKind, string> = { sop: "Standard Operating Procedure", kpi: "Employee KPI sheet", document: "business document" };

/** What step 1 collects. */
export interface ItemDetails {
  title: string;
  department: string;
  designation: string;
  description: string;
  reviewPeriod: string;
}

/** The one-to-two sentence description the sparkle button writes in step 1. */
export const DESCRIPTION_PLAN: ItemSectionPlan = { key: "description", title: "Description", brief: "Write one or two plain sentences describing what this item is for and who uses it, from the title, department and designation. No lists.", minWords: 10, maxWords: 50 };

/** One generated section as the wizard shows and keeps it (blocks are raw PBDoc blocks with ids, validated again on save). */
export interface GeneratedSection {
  key: string;
  title: string;
  blocks: Record<string, unknown>[];
  placeholders: { key: string; label: string }[];
  guardStatus: "clean" | "repaired" | "scrubbed";
  warnings: string[];
}
