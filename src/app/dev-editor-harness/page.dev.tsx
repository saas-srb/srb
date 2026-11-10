import { notFound } from "next/navigation";
import { applyBrandToDoc, identityFor } from "@/lib/products/playbook-ai/brand/apply";
import { DEFAULT_BRAND } from "@/lib/products/playbook-ai/brand/types";
import { getTemplateDef } from "@/lib/products/playbook-ai/catalogue/registry";
import { buildTemplateDoc } from "@/lib/products/playbook-ai/catalogue/validate";
import { stripDraftOnly } from "@/lib/products/playbook-ai/tpl/strip";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { variableCatalogue } from "@/lib/products/playbook-ai/variables-registry";
import { buildLibraryDoc, libraryKindOf } from "@/lib/products/playbook-ai/item-library";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { ItemKind } from "@/lib/products/playbook-ai/items-types";
import Harness from "./Harness";

/**
 * Development-only page for checking the shared editor in a browser without signing in: a catalogue template in an in-memory store.
 * Never available in production (404). Used by scripts/shot-editor.ts.
 */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const id = (await searchParams).t ?? "ct.msa";
  let doc: PBDoc, title: string, kind: ItemKind = "document", docTypeId: string | null = null, meta = null as Parameters<typeof layoutInputFor>[0]["meta"];
  const lib = libraryKindOf(id) ? buildLibraryDoc(id) : null;
  if (lib) { doc = lib.doc; title = lib.info.title; kind = libraryKindOf(id) as ItemKind; meta = lib.meta; }
  else {
    const def = getTemplateDef(id);
    if (!def) notFound();
    const built = buildTemplateDoc(def);
    if (!built.ok) notFound();
    doc = stripDraftOnly(built.doc); title = def.name; docTypeId = def.id;
  }
  const values: Record<string, string> = { "company.name": "Northwind Demo", "company.legal_name": "Northwind Demo Private Limited", "company.address": "14 Residency Road, Bengaluru, Karnataka 560025, India", "company.gstin": "29ABCDE1234F1Z5", "company.website": "www.northwinddemo.in", "company.email": "hello@northwinddemo.in", "company.phone": "+91 80 4000 1234", "date.today": "09 Nov 2026" };
  const layout = layoutInputFor({ kind, title, docTypeId, docNumber: null, meta, version: 1, authorName: null });
  const branded = applyBrandToDoc(doc, DEFAULT_BRAND, values, { layout });
  const variables = variableCatalogue([]).map((v) => ({ key: v.key, label: v.label, group: v.namespace, description: v.description, formats: [v.format] }));
  return <Harness doc={doc} title={title} values={values} variables={variables} view={{ page: branded.page, header: branded.header, footer: branded.footer, layout: { ...layout, identity: identityFor(DEFAULT_BRAND, values) } }} primary={DEFAULT_BRAND.colors.primary} accent={DEFAULT_BRAND.colors.secondary} />;
}
