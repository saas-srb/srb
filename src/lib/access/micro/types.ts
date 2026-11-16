import type { Level } from "../types";

/** What a micro feature guards. Every page, tab, section, action, button, export and API route of a finished product maps to one of these. */
export type MicroKind = "page" | "tab" | "section" | "action" | "button" | "export" | "api" | "scope";

/**
 * One micro-level feature of a product: a stable key, a plain label, a module for grouping (product -> module -> feature),
 * what Read and Write mean, and `legacy`: the legacy capabilities (role-file features) that must all be true for a legacy
 * person to hold it. That link is what keeps parity exact: a person who came from the old roles gets exactly the micro
 * features whose legacy capabilities they hold today, so nobody loses or gains anything; the matrix can then be finer than the old roles.
 */
export interface MicroFeature {
  /** `<product>.<module>.<feature>`, never renamed. */
  key: string;
  product: string;
  module: string;
  kind: MicroKind;
  label: string;
  description: string;
  /** "read" = only opens/views/uses; "write" = changes, creates, deletes, reveals or sends. */
  level: Level;
  /** Scope variant: "all" = everyone's / every record (the person without it sees only what is assigned to them or their own). */
  scope?: "all";
  legacy: string[];
  /** Part of the product's visible baseline: everybody given the product gets it (shown in Preview), so a person with the product but no other feature sees an empty but working product. */
  baseline?: boolean;
}

/** What a mapped route, action or UI part is guarded by: micro feature keys (any one is enough unless `all` is true), or a reason it needs none. */
/** `via`: text that proves the check is made through a shared helper (for example `typeKey(`) when the key is built from the record type. */
export type Guard = { any: string[]; via?: string } | { all: string[]; via?: string } | { open: "self-service" | "session" | "public" | "redirect"; reason: string };
