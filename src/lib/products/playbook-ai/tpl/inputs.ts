/**
 * The inputs form of a template: validation, normalisation and auto-fill bindings. Pure, client-safe (the create-document form runs the
 * same checks as the server, which re-runs them and is the real boundary).
 *
 * Values are stored the way the document variables read them: text, longtext, select as strings; number and money as numbers; date as
 * `YYYY-MM-DD`; yes/no as "yes" / "no"; a multi-select as the chosen values joined by ", "; a rows input as a list of row objects (a list
 * for `repeat` blocks, not an input value); a person input holds the id of the picked record (it becomes a document link, not a value).
 */

import type { InputField, PickerNamespace, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { formatIsoDateIndia } from "@/lib/products/playbook-ai/doc/format";
import { PARTY_FIELDS } from "@/lib/products/playbook-ai/catalogue/variables";

export type RawInputValue = string | number | boolean | string[] | Array<Record<string, unknown>> | Record<string, string> | null | undefined;
export type RawInputs = Record<string, RawInputValue>;

export interface InputsResult {
  ok: boolean;
  /** Per input key: what is wrong. */
  errors: Record<string, string>;
  /** Normalised scalar values for `input.<key>`. */
  values: Record<string, string | number | boolean>;
  /** Normalised rows for `repeat` blocks, keyed `input.<key>`. */
  lists: Record<string, Array<Record<string, string | number>>>;
  /** Picked records: `{ employee: "<id>", client: "<id>" ... }`. */
  picks: Partial<Record<PickerNamespace, string>>;
  /** The details of a party typed in by hand (the `party` picker): `party.name`, `party.address` ... */
  party: Record<string, string>;
}

const isoOk = (s: string): boolean => formatIsoDateIndia(s) !== null;
const present = (v: unknown): boolean => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);

/** An input is shown (and checked) only when its `showWhen` input has the required value. */
export function visibleInputs(inputs: readonly InputField[], raw: RawInputs): InputField[] {
  const out: InputField[] = [];
  for (const inp of inputs) {
    if (inp.showWhen) {
      const target = inputs.find((x) => x.key === inp.showWhen!.key);
      const v = raw[inp.showWhen.key] ?? target?.defaultValue;
      if (String(v ?? "") !== inp.showWhen.equals) continue;
    }
    out.push(inp);
  }
  return out;
}

function num(v: RawInputValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && /^-?[\d,]*\.?\d+$/.test(v.trim().replace(/,/g, ""))) return Number(v.replace(/,/g, ""));
  return null;
}

/** Validates the submitted values against the inputs form. Hidden inputs are ignored; required ones that are missing are errors. */
export function validateInputValues(inputs: readonly InputField[], raw: RawInputs): InputsResult {
  const errors: Record<string, string> = {};
  const values: InputsResult["values"] = {};
  const lists: InputsResult["lists"] = {};
  const picks: InputsResult["picks"] = {};
  const party: Record<string, string> = {};
  for (const inp of visibleInputs(inputs, raw)) {
    const v = raw[inp.key];
    const need = () => { if (inp.required) errors[inp.key] = `${inp.label} is required.`; };
    switch (inp.type) {
      case "text":
      case "longtext": {
        if (!present(v)) { need(); break; }
        if (typeof v !== "string") { errors[inp.key] = `${inp.label} must be text.`; break; }
        const max = inp.maxLength ?? (inp.type === "text" ? 300 : 5000);
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) errors[inp.key] = `${inp.label} contains characters that cannot be used.`;
        else if (v.length > max) errors[inp.key] = `${inp.label} must be at most ${max} characters.`;
        else values[inp.key] = v.trim();
        break;
      }
      case "number":
      case "money": {
        if (!present(v)) { need(); break; }
        const n = num(v);
        if (n === null) errors[inp.key] = `${inp.label} must be a number.`;
        else if (inp.min !== undefined && n < inp.min) errors[inp.key] = `${inp.label} must be at least ${inp.min}.`;
        else if (inp.max !== undefined && n > inp.max) errors[inp.key] = `${inp.label} must be at most ${inp.max}.`;
        else if (inp.type === "money" && n < 0) errors[inp.key] = `${inp.label} cannot be negative.`;
        else values[inp.key] = n;
        break;
      }
      case "date": {
        if (!present(v)) { need(); break; }
        if (typeof v !== "string" || !isoOk(v)) errors[inp.key] = `${inp.label} must be a real date.`;
        else values[inp.key] = v;
        break;
      }
      case "yesno": {
        if (!present(v)) { need(); break; }
        const s = v === true ? "yes" : v === false ? "no" : String(v).toLowerCase();
        if (s !== "yes" && s !== "no") errors[inp.key] = `${inp.label} must be yes or no.`;
        else values[inp.key] = s;
        break;
      }
      case "select": {
        if (!present(v)) { need(); break; }
        if (typeof v !== "string" || !inp.options?.some((o) => o.value === v)) errors[inp.key] = `${inp.label}: choose one of the listed options.`;
        else values[inp.key] = v;
        break;
      }
      case "multiselect": {
        const arr = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",").map((s) => s.trim()) : [];
        if (arr.length === 0) { need(); break; }
        const allowed = new Set((inp.options ?? []).map((o) => o.value));
        if (!arr.every((x) => typeof x === "string" && allowed.has(x))) errors[inp.key] = `${inp.label}: choose from the listed options.`;
        else values[inp.key] = [...new Set(arr as string[])].join(", ");
        break;
      }
      case "person": {
        if (inp.picker === "party") {
          // The other party is typed in by hand: name, address, email, phone, contact and designation.
          const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
          let bad = false;
          for (const f of PARTY_FIELDS) {
            const fv = o[f];
            if (fv === undefined || fv === null || fv === "") continue;
            if (typeof fv !== "string" || fv.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(fv)) { errors[inp.key] = `${inp.label}: ${f.replace("_", " ")} is not valid.`; bad = true; break; }
            party[f] = fv.trim();
          }
          if (!bad && inp.required && !party.name) errors[inp.key] = `${inp.label}: enter the name.`;
          break;
        }
        if (!present(v)) { need(); break; }
        if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) errors[inp.key] = `${inp.label}: pick a record from the list.`;
        else if (inp.picker) picks[inp.picker] = v;
        break;
      }
      case "rows": {
        const rows = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
        const min = Math.max(inp.minRows ?? (inp.required ? 1 : 0), 0);
        const max = inp.maxRows ?? 200;
        if (rows.length < min) { errors[inp.key] = min === 1 ? `Add at least one row to ${inp.label}.` : `${inp.label} needs at least ${min} rows.`; break; }
        if (rows.length > max) { errors[inp.key] = `${inp.label} can have at most ${max} rows.`; break; }
        const out: Array<Record<string, string | number>> = [];
        let bad = null as string | null;
        rows.forEach((row, ri) => {
          if (bad) return;
          const clean: Record<string, string | number> = {};
          for (const col of inp.columns ?? []) {
            const cv = (row as Record<string, unknown>)?.[col.key];
            if (!present(cv)) { if (col.required !== false) bad = `${inp.label}, row ${ri + 1}: ${col.label} is required.`; continue; }
            if (col.type === "number" || col.type === "money") {
              const n = num(cv as RawInputValue);
              if (n === null || (col.type === "money" && n < 0)) bad = `${inp.label}, row ${ri + 1}: ${col.label} must be a ${col.type === "money" ? "valid amount" : "number"}.`;
              else clean[col.key] = n;
            } else if (col.type === "date") {
              if (typeof cv !== "string" || !isoOk(cv)) bad = `${inp.label}, row ${ri + 1}: ${col.label} must be a real date.`;
              else clean[col.key] = cv;
            } else if (typeof cv !== "string" || cv.length > 300) bad = `${inp.label}, row ${ri + 1}: ${col.label} must be text of up to 300 characters.`;
            else clean[col.key] = cv.trim();
          }
          out.push(clean);
        });
        if (bad) errors[inp.key] = bad;
        else if (out.length) lists[`input.${inp.key}`] = out;
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, values, lists, picks, party };
}

/**
 * Auto-fill: for every visible input the user left empty, the first binding whose variable has a value (company profile, linked record,
 * date). `available` is the loaded variable values (`loadVariableValues`). Returns only what it filled; the user can always change it.
 */
export function applyBindings(inputs: readonly InputField[], given: RawInputs, available: Record<string, string | number | boolean | null | undefined>): { filled: RawInputs; sources: Record<string, string> } {
  const filled: RawInputs = {};
  const sources: Record<string, string> = {};
  for (const inp of visibleInputs(inputs, given)) {
    if (!inp.bindings?.length || present(given[inp.key]) || inp.type === "person" || inp.type === "rows") continue;
    for (const b of inp.bindings) {
      const v = available[b];
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) continue;
      filled[inp.key] = inp.type === "number" || inp.type === "money" ? (num(v as RawInputValue) ?? undefined) : String(v);
      if (filled[inp.key] === undefined) { delete filled[inp.key]; continue; }
      sources[inp.key] = b;
      break;
    }
  }
  return { filled, sources };
}

/** Defaults to pre-fill a blank form with (the form's own `defaultValue`s). */
export function defaultInputs(inputs: readonly InputField[]): RawInputs {
  const out: RawInputs = {};
  for (const i of inputs) if (i.defaultValue !== undefined) out[i.key] = i.defaultValue;
  return out;
}

/** Sections of a template whose body the AI writes (`ai` and `hybrid`): marked "pending AI" until the generation step fills them. */
export function pendingAiSections(def: Pick<TemplateDef, "sections">): string[] {
  return def.sections.filter((s) => s.aiMode !== "fixed" && !s.draftOnly).map((s) => s.key);
}
