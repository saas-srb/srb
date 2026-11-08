import "server-only";
import { COLLECTIONS, createStamp, newId, seoCollection, str, updateStamp, type Stamps } from "@/lib/products/rankmax-ai/db";
import { invalidateSite, cleanPath } from "@/lib/products/rankmax-ai/pages";
import { SCHEMA_TYPES, validateJsonLd, type SchemaType, type SchemaValidation } from "@/lib/products/rankmax-ai/schema-validate";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";

/**
 * Managed JSON-LD. A schema is authored and validated here, then PUBLISHED —
 * at which point the (site) layout renders it on the matching public page(s)
 * (see `components/rankmax-ai/ManagedJsonLd.tsx`). Only valid JSON-LD can be
 * published, and the published copy is re-serialized with `<` escaped so it
 * can never break out of its <script> element.
 */

export interface ManagedSchema extends Stamps {
  _id: string;
  name: string;
  type: SchemaType;
  /** Site path, or "*" for every public page. */
  path: string;
  /** As authored in the editor. */
  source: string;
  /** Sanitized copy the site serves — set only while published. */
  jsonld: string;
  status: "draft" | "published" | "disabled";
  validation: SchemaValidation & { checkedAt: Date };
  publishedAt: Date | null;
}

export async function schemasCol() {
  return seoCollection<ManagedSchema>(COLLECTIONS.schemas);
}

function cleanTarget(path: string): string {
  if (path.trim() === "*") return "*";
  const p = cleanPath(path);
  if (!p) throw new SeoInputError("Target must be a site path (e.g. /services) or * for every page.");
  return p;
}

export function sanitizeJsonLd(source: string): string {
  return JSON.stringify(JSON.parse(source)).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export async function saveSchema(
  id: string | null,
  input: { name: string; type: string; path: string; source: string },
  actorId: string
): Promise<{ before: ManagedSchema | null; after: ManagedSchema }> {
  const name = str(input.name, 120);
  if (!name) throw new SeoInputError("Name is required.");
  if (!(SCHEMA_TYPES as readonly string[]).includes(input.type)) throw new SeoInputError("Pick a schema type.");
  const type = input.type as SchemaType;
  const path = cleanTarget(input.path);
  const source = String(input.source ?? "").slice(0, 100_000);
  const validation = { ...validateJsonLd(source, type), checkedAt: new Date() };
  const c = await schemasCol();
  if (id) {
    const before = await c.findOne({ _id: id });
    if (!before) throw new SeoInputError("Schema not found.");
    // Editing a published schema keeps it live only if the new version is still valid.
    const stillPublished = before.status === "published" && validation.valid;
    const set = {
      name,
      type,
      path,
      source,
      validation,
      status: before.status === "published" && !validation.valid ? ("draft" as const) : before.status,
      jsonld: stillPublished ? sanitizeJsonLd(source) : "",
      ...updateStamp(actorId),
    };
    await c.updateOne({ _id: id }, { $set: set });
    if (before.status === "published") invalidateSite(before.path === "*" ? undefined : before.path);
    return { before, after: { ...before, ...set } };
  }
  const doc: ManagedSchema = { _id: newId(), name, type, path, source, jsonld: "", status: "draft", validation, publishedAt: null, ...createStamp(actorId) };
  await c.insertOne(doc);
  return { before: null, after: doc };
}

export async function setSchemaStatus(id: string, status: "published" | "draft" | "disabled", actorId: string): Promise<ManagedSchema> {
  const c = await schemasCol();
  const s = await c.findOne({ _id: id });
  if (!s) throw new SeoInputError("Schema not found.");
  const set: Partial<ManagedSchema> = { status, ...updateStamp(actorId) };
  if (status === "published") {
    const v = validateJsonLd(s.source, s.type);
    if (!v.valid) throw new SeoInputError(`Fix the ${v.errors.length} validation error(s) before publishing.`);
    Object.assign(set, { jsonld: sanitizeJsonLd(s.source), publishedAt: new Date(), validation: { ...v, checkedAt: new Date() } });
  } else {
    set.jsonld = "";
  }
  await c.updateOne({ _id: id }, { $set: set });
  invalidateSite(s.path === "*" ? undefined : s.path);
  return { ...s, ...set };
}

export async function deleteSchema(id: string): Promise<ManagedSchema | null> {
  const c = await schemasCol();
  const s = await c.findOne({ _id: id });
  if (!s) return null;
  await c.deleteOne({ _id: id });
  if (s.status === "published") invalidateSite(s.path === "*" ? undefined : s.path);
  return s;
}
