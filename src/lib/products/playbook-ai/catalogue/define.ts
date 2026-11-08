/**
 * `defineTemplate`: builds a full `TemplateDef` from the catalogue metadata row plus the authored content.
 * It adds what every template of a kind shares, so authors never repeat it and cannot forget it: the drafting-notice sections for
 * legal-review and statute-sensitive types, the exact banner texts, the default A4 page and the layout tokens.
 */

import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import { ALL_META } from "@/lib/products/playbook-ai/catalogue/meta";
import { callout, fixedSection, LETTER_LAYOUT } from "@/lib/products/playbook-ai/catalogue/build";
import {
  LEGAL_REVIEW_BANNER, STATUTE_NOTICE, type CatalogueMeta, type InputField, type LayoutTokens, type TemplateDef, type TemplateSection,
} from "@/lib/products/playbook-ai/catalogue/types";

export interface TemplateSpec {
  title: string;
  inputs: InputField[];
  sections: TemplateSection[];
  layout?: LayoutTokens;
  disclaimers?: string[];
  version?: number;
}

const META_BY_ID = new Map(ALL_META.map((m) => [m.id, m]));

export function metaFor(id: string): CatalogueMeta {
  const m = META_BY_ID.get(id);
  if (!m) throw new Error(`defineTemplate: "${id}" is not in the catalogue`);
  return m;
}

export function defineTemplate(id: string, spec: TemplateSpec): TemplateDef {
  const meta = metaFor(id);
  const notices: TemplateSection[] = [];
  if (meta.legal.review) {
    notices.push({ ...fixedSection("legal_notice", "Legal review notice", [callout("warning", LEGAL_REVIEW_BANNER)], { locked: true }), draftOnly: true });
  }
  if (meta.legal.statute) {
    notices.push({ ...fixedSection("verify_notice", "Verification notice", [callout("important", STATUTE_NOTICE)], { locked: true }), draftOnly: true });
  }
  return {
    ...meta,
    version: spec.version ?? 1,
    lang: "en",
    title: spec.title,
    inputs: spec.inputs,
    sections: [...notices, ...spec.sections],
    page: DEFAULT_PAGE,
    layout: spec.layout ?? LETTER_LAYOUT,
    ...(meta.legal.review ? { legalBanner: LEGAL_REVIEW_BANNER } : {}),
    ...(meta.legal.statute ? { statuteNotice: STATUTE_NOTICE } : {}),
    disclaimers: spec.disclaimers ?? [],
  };
}
