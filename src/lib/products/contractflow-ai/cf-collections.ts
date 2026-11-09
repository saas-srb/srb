/**
 * Names of the ContractFlow signing-and-vault collections (prefix `cf_`). Client-safe: names only, no database access.
 *
 * Tenancy: every collection is company-scoped by default (`lib/platform/tenancy/scoped-db.ts`). A collection whose `_id` is a fixed key
 * (a counter or a settings singleton) MUST also be listed in `KEYED_COLLECTIONS` (`lib/platform/tenancy/collections.ts`), or two companies
 * would collide on the same `_id`. `CF_ID_KIND` declares which kind each collection is; `scripts/test-cf-foundation.ts` fails when a
 * fixed-`_id` collection is not registered, or when source code names a `cf_` collection that is not declared here.
 *
 * The old `lpms_*` collections are NOT touched by this file: they are kept as they are (see `archive-plan.ts`).
 */

export const CF_COLLECTIONS = {
  /** Settings singleton, `_id: "main"`. KEYED. */
  settings: "cf_settings",
  /** Numbering and other sequences, `_id` = `<series>:<financial year>`. KEYED. */
  counters: "cf_counters",
  /** The person or business on the other side: a thin index that LINKS to the system of record (B9). */
  parties: "cf_parties",
  /** Clones of Playbook documents (B1). */
  documents: "cf_documents",
  /** Edit history of a clone (B1). */
  cloneEdits: "cf_clone_edits",
  /** Every saved version of a clone: full content, who, when, summary, and the status each version reached (P8). */
  cloneVersions: "cf_clone_versions",
  /** The conversation of the "Edit with AI" panel, one row per message (P9). */
  cloneChat: "cf_clone_chat",
  /** A request to sign one clone (B2). */
  requests: "cf_requests",
  /** One row per signer of a request; holds the HASH of the signer's link token (B2). */
  signers: "cf_signers",
  /** Append-only event log of requests and signers (B2). */
  events: "cf_events",
  /** One-time codes, hashed, with expiry (B3). */
  otp: "cf_otp",
  /** Sealed (signed) files and their hashes (B6). */
  sealed: "cf_sealed",
  /** The party-wise signed-document vault (B10). */
  vaultItems: "cf_vault_items",
  /** Uploaded e-stamp certificates (B5b). */
  stampCertificates: "cf_stamp_certificates",
} as const;

export type CfCollectionName = (typeof CF_COLLECTIONS)[keyof typeof CF_COLLECTIONS];

/** `fixed` = the code stores a meaningful `_id` (needs KEYED registration); `uuid` = random id. */
export const CF_ID_KIND: Record<CfCollectionName, "fixed" | "uuid"> = {
  cf_settings: "fixed",
  cf_counters: "fixed",
  cf_parties: "uuid",
  cf_documents: "uuid",
  cf_clone_edits: "uuid",
  cf_clone_versions: "uuid",
  cf_clone_chat: "uuid",
  cf_requests: "uuid",
  cf_signers: "uuid",
  cf_events: "uuid",
  cf_otp: "uuid",
  cf_sealed: "uuid",
  cf_vault_items: "uuid",
  cf_stamp_certificates: "uuid",
};

/** Collections that store a fixed `_id` and therefore must be in `KEYED_COLLECTIONS`. */
export const CF_KEYED_COLLECTIONS: readonly CfCollectionName[] = (Object.keys(CF_ID_KIND) as CfCollectionName[]).filter((n) => CF_ID_KIND[n] === "fixed");

/** Platform-level (global) collection owned by this product: the stamp-duty rulebook (B5a). */
export const STAMP_RULEBOOK_COLLECTION = "stamp_rulebook";

/** Platform-level lookup from a public verification code to the company that sealed the document (the verify page has no signed-in company). */
export const SEAL_INDEX_COLLECTION = "contractflow_seal_index";
