/**
 * Names of the Playbook document collections (prefix `pb_`). Client-safe: names only, no database access.
 *
 * Tenancy: every collection is company-scoped by default (`lib/platform/tenancy/scoped-db.ts`). A collection whose `_id` is a fixed key
 * (a counter or a settings singleton) MUST also be listed in `KEYED_COLLECTIONS` (`lib/platform/tenancy/collections.ts`), or two companies
 * would collide on the same `_id`. `PB_KEYED_COLLECTIONS` is the list this product relies on; `scripts/test-playbook-foundation.ts`
 * checks that it matches the tenancy file, so adding a keyed collection here without registering it fails the test.
 *
 * Only the collections that already have an owner feature are listed; each later feature adds its own name here.
 */

export const PB_COLLECTIONS = {
  /** Numbering series, `_id` = `<series>:<financial year>` (A10). KEYED. */
  counters: "pb_counters",
  /** Document settings singleton, `_id: "main"` (A10). KEYED. */
  settings: "pb_settings",
  /** Letterhead and brand singleton, `_id: "main"` (A7). KEYED. */
  brand: "pb_brand",
  /** Documents: head and editable draft (A4). Random UUID `_id`s. */
  documents: "pb_documents",
  /** Immutable versions (A4). Random UUID `_id`s. */
  versions: "pb_versions",
  /** Company templates (A9). Random UUID `_id`s. */
  templates: "pb_templates",
  /** Append-only audit (A4). Random UUID `_id`s. */
  audit: "pb_audit",
  /** Company-defined custom variables `custom.*` (A8). Random UUID `_id`s. */
  variables: "pb_variables",
  /** AI drafting runs: who asked, for which section, model, tokens, guard result and the outcome (A11). Random UUID `_id`s. */
  aiRuns: "pb_ai_runs",
  /** Immutable published versions of company templates (A9). Random UUID `_id`s. */
  templateVersions: "pb_template_versions",
  /** Links between a Playbook version and the ContractFlow clone made from it for signature, with the status coming back (H1, H2). Random UUID `_id`s. */
  handoffs: "pb_handoffs",
  /** Metadata of brand images (logo, signature and stamp images); the bytes live in private storage under a company-prefixed key (A7). Random UUID `_id`s. */
  brandAssets: "pb_brand_assets",
  /** The Edit with AI conversation of a Playbook item, one row per message. Random UUID `_id`s. */
  editChat: "pb_edit_chat",
} as const;

export type PbCollectionName = (typeof PB_COLLECTIONS)[keyof typeof PB_COLLECTIONS];

/** Collections that store a fixed `_id` and therefore must be in `KEYED_COLLECTIONS`. */
export const PB_KEYED_COLLECTIONS: readonly PbCollectionName[] = [PB_COLLECTIONS.counters, PB_COLLECTIONS.settings, PB_COLLECTIONS.brand];
