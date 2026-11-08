import { DATA_FIELD_KEY, DATA_FIELD_LIMITS, DataFieldError, PURPOSE_BY_KEY, normalizeDataFields, type DataField } from "@/lib/products/agentos/calls/purposes";

/** Pure list operations behind the "Data to collect" editor in the voice agent form (client-safe, unit-tested). */

/** A machine key from a label: lowercase, underscores, starts with a letter, unique among `taken`. */
export function slugKey(label: string, taken: readonly string[]): string {
  let base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) base = "field";
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, DATA_FIELD_LIMITS.keyMax);
  let key = base;
  for (let n = 2; taken.includes(key); n++) {
    const suffix = `_${n}`;
    key = `${base.slice(0, DATA_FIELD_LIMITS.keyMax - suffix.length)}${suffix}`;
  }
  return key;
}

/** A new empty row. Its key follows the label until the person edits the key themselves. */
export function blankField(existing: readonly DataField[]): DataField {
  return { key: slugKey("field", existing.map((f) => f.key)), label: "", type: "text", description: "", required: false };
}

export function addField(fields: readonly DataField[]): DataField[] {
  if (fields.length >= DATA_FIELD_LIMITS.max) return [...fields];
  return [...fields, blankField(fields)];
}

export function removeField(fields: readonly DataField[], index: number): DataField[] {
  return fields.filter((_, i) => i !== index);
}

/** Moves a row up (-1) or down (+1). Out-of-range moves leave the list unchanged. */
export function moveField(fields: readonly DataField[], index: number, delta: -1 | 1): DataField[] {
  const to = index + delta;
  if (index < 0 || index >= fields.length || to < 0 || to >= fields.length) return [...fields];
  const next = [...fields];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function updateField(fields: readonly DataField[], index: number, patch: Partial<DataField>): DataField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
}

/** Changes a row's type. A choice starts with no options; leaving "choice" drops them. */
export function setFieldType(fields: readonly DataField[], index: number, type: DataField["type"]): DataField[] {
  return fields.map((f, i) => {
    if (i !== index) return f;
    const { options, ...rest } = f;
    return type === "choice" ? { ...rest, type, options: options ?? [] } : { ...rest, type };
  });
}

/** One option per line (or comma-separated) -> trimmed, deduplicated options, capped to the server's limits. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n,]/)) {
    const o = part.replace(/\s+/g, " ").trim().slice(0, DATA_FIELD_LIMITS.optionMax);
    if (o) seen.add(o);
    if (seen.size >= DATA_FIELD_LIMITS.optionsMax) break;
  }
  return [...seen];
}

/** The union of the suggested fields of the chosen purposes, in order, one per key. */
export function suggestedFieldsFor(purposes: readonly string[]): DataField[] {
  const seen = new Set<string>();
  const out: DataField[] = [];
  for (const p of purposes) {
    for (const f of PURPOSE_BY_KEY.get(p)?.suggestedFields ?? []) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push({ ...f, ...(f.options ? { options: [...f.options] } : {}) });
    }
  }
  return out;
}

/** Suggestions the person hasn't added yet. */
export function missingSuggestions(current: readonly DataField[], purposes: readonly string[]): DataField[] {
  const have = new Set(current.map((f) => f.key));
  return suggestedFieldsFor(purposes).filter((f) => !have.has(f.key));
}

/**
 * Adds the suggestions of a newly chosen purpose. Rows the person already has are never changed or removed. With `onlyIfEmpty`
 * (the first purpose chosen on a blank list) it prefills; otherwise it appends the missing ones up to the limit.
 */
export function withSuggestions(current: readonly DataField[], purposes: readonly string[]): DataField[] {
  const room = DATA_FIELD_LIMITS.max - current.length;
  return [...current, ...missingSuggestions(current, purposes).slice(0, Math.max(room, 0))];
}

/** Per-row problems in the same words the server uses (index -> message). Empty when the list would be accepted. */
export function fieldProblems(fields: readonly DataField[]): Record<number, string> {
  const out: Record<number, string> = {};
  const seen = new Map<string, number>();
  fields.forEach((f, i) => {
    const label = f.label.trim();
    if (!label) return void (out[i] = "Give it a name.");
    if (!DATA_FIELD_KEY.test(f.key.trim())) return void (out[i] = "The key must start with a letter and use only lowercase letters, digits and underscores.");
    if (seen.has(f.key.trim())) return void (out[i] = `The key "${f.key.trim()}" is used twice.`);
    seen.set(f.key.trim(), i);
    if (!f.description.trim()) return void (out[i] = "Describe how to find the answer in the conversation.");
    if (f.type === "choice" && new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean)).size < 2) out[i] = "A choice needs at least two options.";
  });
  return out;
}

/** The first server-side validation message for the list, or null (the server is the authority; this is the same function). */
export function firstServerProblem(fields: readonly DataField[]): string | null {
  try {
    normalizeDataFields(fields);
    return null;
  } catch (e) {
    if (e instanceof DataFieldError) return e.message;
    throw e;
  }
}
