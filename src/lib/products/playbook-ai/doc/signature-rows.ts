/**
 * Signature blocks are printed two to a row (two equal columns). This is the one place that decides the pairing, used by the PDF, the DOCX and the
 * editor's generated blocks, so every template gets the same layout without any template changing. Pure and client-safe.
 *
 * Consecutive `signatureBlock`s are taken in order, two at a time: Company | Client, Witness one | Witness two. An odd last block, or one alone,
 * sits in the left column. The blocks keep their ids and data; nothing is stored differently.
 */
import type { SignatureBlock } from "@/lib/products/playbook-ai/doc/types";

export interface SignatureRow<B extends { type: string } = SignatureBlock> { type: "signatureRow"; id: string; blocks: B[] }

export function groupSignatureRows<T extends { type: string; id?: string }>(list: readonly T[]): (T | SignatureRow<T>)[] {
  const out: (T | SignatureRow<T>)[] = [];
  let run: T[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) {
      const blocks = run.slice(i, i + 2);
      out.push({ type: "signatureRow", id: `sigrow-${blocks[0].id ?? i}`, blocks });
    }
    run = [];
  };
  for (const b of list) {
    if (b.type === "signatureBlock") run.push(b);
    else { flush(); out.push(b); }
  }
  flush();
  return out;
}
