import type { Node as PMNode } from "@tiptap/pm/model";

export interface FindOptions { caseSensitive?: boolean; wholeWord?: boolean }
export interface Range { from: number; to: number }

const MAX_MATCHES = 5000;
const WORD = /[\p{L}\p{N}_]/u;

/** All non-overlapping matches of `query` in `text` as offsets. Plain text search (the query is never a pattern). */
export function findRanges(text: string, query: string, opts: FindOptions = {}): Range[] {
  if (!query) return [];
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const out: Range[] = [];
  let i = 0;
  while (out.length < MAX_MATCHES) {
    const at = hay.indexOf(needle, i);
    if (at === -1) break;
    const end = at + needle.length;
    const ok = !opts.wholeWord || (!(at > 0 && WORD.test(text[at - 1])) && !(end < text.length && WORD.test(text[end])));
    if (ok) { out.push({ from: at, to: end }); i = end; } else i = at + 1;
  }
  return out;
}

/** Text runs of a document (contiguous inline text inside one textblock), with the document position of their first character. */
export interface TextRun { pos: number; text: string; /** Document position of each character. */ at: number[] }

export function collectTextRuns(doc: PMNode, opts: { skip?: (n: PMNode) => boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  doc.descendants((node, pos) => {
    if (opts.skip?.(node)) return false;
    if (!node.isTextblock) return true;
    let cur: TextRun | null = null;
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        if (!cur) { cur = { pos: start, text: "", at: [] }; runs.push(cur); }
        for (let k = 0; k < child.text.length; k++) { cur.text += child.text[k]; cur.at.push(start + k); }
      } else cur = null; // an atom (variable chip, hard break) ends the run: a match never spans one
    });
    return false;
  });
  return runs;
}

export interface DocMatch extends Range { index: number }

/** Matches across the document, as document positions. Characters are assumed contiguous within a run (true for text nodes). */
export function findInDoc(doc: PMNode, query: string, opts: FindOptions = {}, skip?: (n: PMNode) => boolean): DocMatch[] {
  const out: DocMatch[] = [];
  for (const run of collectTextRuns(doc, { skip })) {
    for (const r of findRanges(run.text, query, opts)) {
      if (out.length >= MAX_MATCHES) return out;
      out.push({ from: run.at[r.from], to: run.at[r.to - 1] + 1, index: out.length });
    }
  }
  return out;
}

/** The match at or after `pos`, wrapping around; -1 when there are none. */
export function nextMatchIndex(matches: readonly Range[], pos: number): number {
  if (!matches.length) return -1;
  const i = matches.findIndex((m) => m.from >= pos);
  return i === -1 ? 0 : i;
}
export function previousMatchIndex(matches: readonly Range[], pos: number): number {
  if (!matches.length) return -1;
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].to <= pos) return i;
  return matches.length - 1;
}

/** Applies replacements to a plain string (used by tests and by anything that edits text outside the editor). */
export function replaceAllInText(text: string, query: string, replacement: string, opts: FindOptions = {}): string {
  const ranges = findRanges(text, query, opts);
  let out = "";
  let last = 0;
  for (const r of ranges) { out += text.slice(last, r.from) + replacement; last = r.to; }
  return out + text.slice(last);
}
