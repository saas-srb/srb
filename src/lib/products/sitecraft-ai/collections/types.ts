import type { FieldSpec } from "@/lib/products/sitecraft-ai/section-registry";

/**
 * A CMS collection: a set of editable records (blog posts, jobs, engagement
 * models, products) that several pages, listings and SEO metadata all read.
 *
 * Records are stored JSON-safe (icons as icon-map keys) and live only in the
 * CMS — there is no code copy.
 */
export interface CollectionDef<Stored extends { slug: string } = { slug: string }, Runtime = unknown> {
  key: CollectionKey;
  label: string;
  singular: string;
  /** Public URL of a record's own page, if records have one. */
  pathOf?: (slug: string) => string;
  /** Validate + normalize raw stored data; null when unusable. */
  parse: (raw: unknown) => Stored | null;
  /** JSON-safe record -> what components expect (resolves icon keys etc.). */
  toRuntime: (record: Stored) => Runtime;
  titleOf: (record: Stored) => string;
  /** Editor fields (the generic section form renders these). */
  fields: FieldSpec[];
  /** A blank record for "New …". */
  blank: (slug: string) => Stored;
}

export type CollectionKey = "blog" | "jobs" | "engagement" | "products";

/** Published, JSON-safe records per collection — what the server hands the client. */
export type CollectionsSnapshot = Partial<Record<CollectionKey, { slug: string }[]>>;
