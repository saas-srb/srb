/** A valid, minimal template to start a company template from scratch. Pure, client-safe. */
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import type { CategoryKey, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";

export function blankTemplateDef(typeId: string, category: CategoryKey, name: string): TemplateDef {
  return {
    id: typeId,
    name,
    category,
    purpose: "A company template.",
    party: "none",
    audience: "internal",
    sign: "no",
    needsSignature: false,
    legal: { review: false, statute: false },
    esignIneligible: false,
    stamp: { rule: "none" },
    retentionKey: "general",
    numberingPrefix: "DOC",
    inputsSummary: ["Subject"],
    sectionsSummary: ["Content"],
    version: 1,
    lang: "en",
    title: name,
    inputs: [{ key: "subject", label: "Subject", type: "text", required: true, help: "What the document is about.", maxLength: 200 }],
    sections: [{
      key: "content",
      title: "Content",
      aiMode: "ai",
      locked: false,
      ai: {
        tone: "neutral",
        minWords: 80,
        maxWords: 400,
        brief: "Write the document about the subject, using only the facts provided.",
        allowedFacts: ["input.subject", "company.name"],
        neverInvent: ["Names, dates, amounts, registration numbers or any other fact that was not provided."],
      },
      body: [{ type: "paragraph", content: [{ type: "placeholder", key: "input.subject", label: "Subject" }] }],
    }],
    page: DEFAULT_PAGE,
    layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "left" },
    disclaimers: [],
  };
}
