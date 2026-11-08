/**
 * Variables a catalogue template may use. Pure, client-safe.
 *
 * The source of truth is the variable registry (`variables-registry.ts`, which the editor's picker and the missing-data report also read):
 * `KNOWN_FIELDS` is DERIVED from it, so a template can only use a variable the registry provides. `input.*` keys must be declared inputs of
 * the template; `custom.*` is the company's own variables and is open; `party.*` is free-form in the registry, so templates are held to the
 * common party fields below.
 */

import { BUILTIN_VARIABLES } from "@/lib/products/playbook-ai/variables-registry";
import type { PickerNamespace } from "@/lib/products/playbook-ai/catalogue/types";

/** Fields a template may use from the free-form `party` namespace (the document form offers exactly these). */
export const PARTY_FIELDS = ["name", "address", "email", "phone", "contact_name", "designation"] as const;

function derive(): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const v of BUILTIN_VARIABLES) (out[v.namespace] ??= []).push(v.key.slice(v.namespace.length + 1));
  out.party = [...PARTY_FIELDS];
  return out;
}

export const KNOWN_FIELDS: Record<string, readonly string[]> = derive();

/** Namespaces that need a matching person/party picker input in the template (the record the fields are read from). */
export const PICKER_BACKED: readonly PickerNamespace[] = ["employee", "candidate", "client", "vendor", "project", "party"];

export function isKnownVariable(key: string): boolean {
  const [ns, ...rest] = key.split(".");
  if (ns === "input" || ns === "custom") return rest.length >= 1;
  const fields = KNOWN_FIELDS[ns];
  return !!fields && rest.length === 1 && fields.includes(rest[0]);
}

/** All known (non-input, non-custom) variable keys, sorted. */
export function listKnownVariables(): string[] {
  const out: string[] = [];
  for (const [ns, fields] of Object.entries(KNOWN_FIELDS)) for (const f of fields) out.push(`${ns}.${f}`);
  return out.sort();
}
