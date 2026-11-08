/** Clause and list numbering shared by the editor, the PDF and the DOCX renderers so all three print the same labels. Pure, client-safe. */
import type { ContentBlock, ListStyle } from "@/lib/products/playbook-ai/doc/types";
import { childBlocks, walkBlocks } from "@/lib/products/playbook-ai/doc/walk";

const ROMAN: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];

export function toRoman(n: number): string {
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  for (const [v, s] of ROMAN) while (rest >= v) { out += s; rest -= v; }
  return out;
}

/** a, b, ... z, aa, ab, ... */
export function toAlpha(n: number): string {
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

/** The marker printed before item `n` (1-based) of an ordered list. */
export function listMarker(style: ListStyle, n: number): string {
  if (style === "alpha") return `${toAlpha(n)}.`;
  if (style === "roman") return `${toRoman(n)}.`;
  return `${n}.`;
}

/**
 * Labels for numbered clauses across the whole body, in document order: level 1 = "1.", level 2 = "1.1", level 3 = "(a)".
 * A higher-level clause restarts the lower counters. Unnumbered clauses get no label and do not count. A level-2 clause with no level-1
 * parent counts from "0.1" is avoided by treating the missing parent as 1.
 */
export function clauseLabels(body: readonly ContentBlock[]): Map<string, string> {
  const labels = new Map<string, string>();
  let a = 0;
  let b = 0;
  let c = 0;
  walkBlocks(body, (blk) => {
    if (blk.type !== "clause" || !blk.numbered) return;
    if (blk.level === 1) { a += 1; b = 0; c = 0; labels.set(blk.id, `${a}.`); }
    else if (blk.level === 2) { if (a === 0) a = 1; b += 1; c = 0; labels.set(blk.id, `${a}.${b}`); }
    else { if (a === 0) a = 1; if (b === 0) b = 1; c += 1; labels.set(blk.id, `(${toAlpha(c)})`); }
  });
  return labels;
}

export { childBlocks };
