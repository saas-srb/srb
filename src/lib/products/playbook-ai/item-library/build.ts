/**
 * Library authoring kit (P2). Pure and client-safe. SOPs and KPI sheets are written as plain data (`SopSpec`, `KpiSpec`) and compiled to PBDoc
 * blocks here, so every library entry has the same professional structure and the content stays easy to review.
 * Revision history and the approval block are added at render time by `doc/layout.ts`, so they are not part of the content.
 * Pipe-separated strings are "a | b | c" rows. The text uses `{{company.name}}` style variables, resolved when the item is rendered.
 */

import { bullets, h, p, table } from "@/lib/products/playbook-ai/catalogue/build";
import type { RawBlock } from "@/lib/products/playbook-ai/catalogue/types";
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import { PBDOC_SCHEMA_VERSION } from "@/lib/products/playbook-ai/doc/types";
import { sequentialIds } from "@/lib/products/playbook-ai/doc/ids";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

export interface SopSpec {
  id: string;
  title: string;
  department: string;
  /** One line for the library card. */
  summary: string;
  purpose: string;
  scope: string;
  /** "Role | Responsibility" */
  roles: string[];
  /** "Term | Meaning" */
  definitions: string[];
  /** "Step | Owner | What is done" */
  steps: string[];
  controls: string[];
  records: string[];
  measures: string[];
  exceptions: string[];
  references: string[];
}

export interface KpiSpec {
  id: string;
  /** The role the sheet is for. */
  title: string;
  department: string;
  summary: string;
  purpose: string;
  /** "KPI | Definition | Formula | Target | Weightage | Frequency | Data source" */
  kpis: string[];
  cadence: string[];
  /** "Rating | Meaning" */
  scale: string[];
  improvement: string[];
}

const split = (row: string): string[] => row.split("|").map((x) => x.trim());
const cols = (row: string, n: number, label: string): string[] => {
  const c = split(row);
  if (c.length !== n) throw new Error(`${label}: expected ${n} columns in "${row.slice(0, 60)}"`);
  return c;
};

export const COMPANY_TO_SET = "Company to set";

/** Reasons a procedure cannot start: what must be in place first. Keyed by SOP id (see `sop-prerequisites.ts`). */
export type PrereqMap = Record<string, string[]>;

export function sopBody(s: SopSpec, prereq: string[] = []): RawBlock[] {
  const parts: [string, RawBlock[]][] = [
    ["Purpose", [p(s.purpose)]],
    ["Scope and applicability", [p(s.scope)]],
    ["Roles and responsibilities", [table([28, 72], ["Role", "Responsibility"], s.roles.map((r) => cols(r, 2, `${s.id} roles`)))]],
    ["Definitions", [table([28, 72], ["Term", "Meaning"], s.definitions.map((r) => cols(r, 2, `${s.id} definitions`)))]],
    ...(prereq.length ? [["Prerequisites and inputs", [p("The procedure starts only when the following are in place."), bullets(prereq)]] as [string, RawBlock[]]] : []),
    ["Procedure", [table([7, 25, 20, 48], ["No.", "Step", "Owner", "Action"], s.steps.map((r, i) => { const c = cols(r, 3, `${s.id} steps`); return [String(i + 1), `**${c[0]}**`, c[1], c[2]]; }))]],
    ["Controls and checks", [bullets(s.controls)]],
    ["Records", [bullets(s.records)]],
    ["Performance measures", [bullets(s.measures)]],
    ["Exceptions and escalation", [bullets(s.exceptions)]],
    ["References", [bullets(s.references)]],
  ];
  return parts.flatMap(([title, blocks], i) => [h(1, `${i + 1}. ${title}`), ...blocks]);
}

export function kpiBody(k: KpiSpec): RawBlock[] {
  return [
    h(1, "1. Role purpose"), p(k.purpose),
    h(1, "2. Key performance indicators"),
    table([17, 22, 19, 14, 8, 10, 10], ["KPI", "Definition", "Formula", "Target", "Weightage", "Frequency", "Data source"], k.kpis.map((r) => { const c = cols(r, 7, `${k.id} kpis`); return [`**${c[0]}**`, c[1], c[2], c[3], c[4], c[5], c[6]]; })),
    p("Weightage adds up to 100%. Where a target reads \"" + COMPANY_TO_SET + "\", the manager and the employee agree the number at the start of the review period and record it here."),
    h(1, "3. Scoring each indicator"),
    p("At the end of each review period the actual result of every indicator is compared with its agreed target and given a score. The weighted score of an indicator is its score multiplied by its weightage, and the overall result is the total of the weighted scores."),
    table([24, 76], ["Result against target", "Score given"], [["Well below target", "1: unsatisfactory"], ["Below target", "2: needs improvement"], ["At target", "3: meets expectations"], ["Above target", "4: exceeds expectations"], ["Well above target", "5: outstanding"]]),
    p("Results come only from the data source named for the indicator. If the source is unavailable, the manager and the employee agree in writing how the result will be established, and the reason is recorded."),
    h(1, "4. Review cadence"), bullets(k.cadence),
    h(1, "5. Rating scale"),
    table([22, 78], ["Rating", "Meaning"], k.scale.map((r) => cols(r, 2, `${k.id} scale`))),
    h(1, "6. Improvement plan"), bullets(k.improvement),
    h(1, "7. Acknowledgement and sign-off"),
    p("The employee and the reporting manager confirm that the indicators, targets and weightage above were discussed and agreed for the review period, and that the employee has seen and understood how the result will be scored."),
    table([30, 35, 35], ["Role", "Name", "Date"], [["Employee", "{{employee.name|text|Employee}}", "{{date.today|date}}"], ["Reporting manager", "Reporting manager", "{{date.today|date}}"]]),
  ];
}

export function rawToDoc(body: RawBlock[]): PBDoc {
  const r = parseDoc({ schemaVersion: PBDOC_SCHEMA_VERSION, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body }, { assignIds: true, idFactory: sequentialIds("l") });
  if (!r.ok) throw new Error(`Library content is not valid: ${r.issues[0]?.path} ${r.issues[0]?.message}`);
  return r.doc;
}
