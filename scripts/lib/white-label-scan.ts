import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Words a tenant must never see: the platform's own name. Case-insensitive; "SRB" only as a word (not inside an identifier or longer word). */
export const BRAND_WORDS = /(?<![A-Za-z0-9_$])SRB(?![a-z0-9$])|Self ?Run|SELFRUN|selfrunbusiness/;
/** Lowercase `selfrun` / `srb` tokens (storage keys, crypto labels, mode values, ids) are internal identifiers a person never reads, so only the written brand forms count. */

/** Removes // and block comments but keeps string contents and line numbers (comments become spaces / empty lines). */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let str: string | null = null;
  let tplDepth = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (str) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === str) str = null;
      else if (str === "`" && c === "$" && d === "{") tplDepth++;
      i++; continue;
    }
    if (c === "/" && d === "/" && src[i - 1] !== ":") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; out += c; i++; continue; }
    out += c; i++;
  }
  void tplDepth;
  return out;
}

export interface Hit { file: string; line: number; text: string }

/** Lines (outside comments) that put a platform-brand word into something a person can read: a string, template or JSX text. Identifiers are ignored. */
export function visibleHits(file: string, src: string): Hit[] {
  const clean = stripComments(src);
  const hits: Hit[] = [];
  clean.split("\n").forEach((line, idx) => {
    const m = BRAND_WORDS.exec(line);
    if (!m) return;
    const before = line.slice(0, m.index);
    // inside a quote on this line, or a JSX text line (no quote, contains > or starts with text)
    const q = (before.match(/(?<!\\)["'`]/g) ?? []).length;
    const inString = q % 2 === 1 || /\\n|`/.test(before) && q % 2 === 1;
    const jsxText = !/["'`]/.test(line) && /[<>]/.test(line) || /^\s*[A-Za-z][^=;{}()]*$/.test(line.trim()) && !/^\s*(import|export|const|let|var|function|return|type|interface)\b/.test(line);
    if (inString || jsxText) hits.push({ file, line: idx + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

export const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
export const sourceFiles = (roots: string[]) => roots.flatMap((r) => walk(r)).filter((f) => /\.(ts|tsx)$/.test(f));
export const readSrc = (f: string) => readFileSync(f, "utf8");
