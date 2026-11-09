/** Removing drafting-only sections from a document at issue. Pure, client-safe. */
import type { ContentBlock, PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { isDraftOnlySectionKey } from "@/lib/products/playbook-ai/tpl/types";

/**
 * The legal-review and statute notices (and any company section whose key starts with `draft_`) are drafting aids. They are shown while the
 * document is a draft and removed when it is issued, so the issued PDF and Word file carry no "AI draft" banner. Returns the same
 * document object when there is nothing to remove.
 */
export function stripDraftOnly(doc: PBDoc): PBDoc {
  const keep = (b: ContentBlock) => !(b.type === "section" && isDraftOnlySectionKey(b.key));
  if (doc.body.every(keep)) return doc;
  return { ...doc, body: doc.body.filter(keep) };
}

export function hasDraftOnly(doc: PBDoc): boolean {
  return doc.body.some((b) => b.type === "section" && isDraftOnlySectionKey(b.key));
}
