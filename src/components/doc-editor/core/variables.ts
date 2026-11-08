import { IDENT_RE, VAR_KEY_RE } from "@/lib/products/playbook-ai/doc/limits";
import { VARIABLE_NAMESPACES, type VariableFormat } from "@/lib/products/playbook-ai/doc/types";

/** One entry of the variable registry the host passes in. The editor never fetches variables itself. */
export interface VariableDef {
  key: string;
  label: string;
  group: string;
  description?: string;
  /** Used for the resolved preview when the host passes no value. Must be real or absent; the editor never invents one. */
  sample?: string;
  formats?: VariableFormat[];
}

export function isValidVariableKey(key: string): boolean {
  return VAR_KEY_RE.test(key) && (VARIABLE_NAMESPACES as readonly string[]).includes(key.split(".")[0]);
}

export function groupVariables(defs: readonly VariableDef[], query = ""): { group: string; items: VariableDef[] }[] {
  const q = query.trim().toLowerCase();
  const hit = (d: VariableDef) => !q || d.key.toLowerCase().includes(q) || d.label.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q);
  const map = new Map<string, VariableDef[]>();
  for (const d of defs) {
    if (!hit(d)) continue;
    const list = map.get(d.group) ?? [];
    list.push(d);
    map.set(d.group, list);
  }
  return [...map].map(([group, items]) => ({ group, items: items.sort((a, b) => a.label.localeCompare(b.label)) })).sort((a, b) => a.group.localeCompare(b.group));
}

/** A placeholder key from a label the user typed: "Joining date" becomes input.joining_date. */
export function placeholderKey(label: string): string | null {
  const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!slug) return null;
  const field = /^[0-9]/.test(slug) ? `f_${slug}` : slug;
  const key = `input.${field.slice(0, 40)}`;
  return VAR_KEY_RE.test(key) ? key : null;
}

export const isIdent = (s: string) => IDENT_RE.test(s);
