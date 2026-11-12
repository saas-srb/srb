/**
 * Static module-graph report (no build needed): which source files are the heaviest and which shared modules pull the most code into the most
 * route entries. Dynamic `import()` is NOT followed (that is the point of lazy loading). Run: npx tsx scripts/analyze-graph.ts [topN]
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SRC = resolve("src");
const top = Number(process.argv[2] ?? 25);
const files = new Map<string, { size: number; static: string[]; lines: number }>();
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?|json)$/.test(f) && !/\.dev\.tsx$/.test(f)) files.set(p, { size: statSync(p).size, static: [], lines: 0 }); } };
walk(SRC);
const exts = ["", ".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"];
const resolveImport = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const e of exts) { const p = base + e; if (files.has(p)) return p; }
  return null;
};
const RE = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)((?:[^'";]*?)\sfrom\s+)?["']([^"']+)["']/g;
/** `import { type A, type B } from` (and `import type`) carries no runtime code. */
const typeOnly = (clause: string | undefined) => !!clause && /^\s*\{([^}]*)\}\s*from\s*$/.test(clause) && clause.replace(/[{}]|from/g, "").split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith("type "));
for (const [p, f] of files) {
  if (!/\.(tsx?|jsx?)$/.test(p)) continue;
  const text = readFileSync(p, "utf8");
  f.lines = text.split("\n").length;
  // A "use server" module is a boundary: importers get references, not the module's own code.
  for (const m of text.matchAll(RE)) { if (typeOnly(m[1])) continue; const r = resolveImport(p, m[2]); if (r) f.static.push(r); }
}
const entries = [...files.keys()].filter((p) => /\/(page|route|layout|loading|error|not-found|default)\.(tsx?|jsx?)$/.test(p) && p.includes("/app/"));
const isServerAction = (p: string) => /^\s*["']use server["']/.test(readFileSync(p, "utf8").slice(0, 200));
const actionCache = new Map<string, boolean>();
const boundary = (p: string) => { let v = actionCache.get(p); if (v === undefined) { v = /\.(tsx?|jsx?)$/.test(p) && isServerAction(p); actionCache.set(p, v); } return v; };
const reach = (e: string) => { const seen = new Set<string>(); const st = [e]; while (st.length) { const x = st.pop()!; if (seen.has(x)) continue; seen.add(x); if (x !== e && boundary(x)) continue; for (const y of files.get(x)?.static ?? []) st.push(y); } return seen; };
const usedBy = new Map<string, number>();
let totalReach = 0;
const perEntry: { e: string; n: number; bytes: number }[] = [];
for (const e of entries) {
  const r = reach(e);
  totalReach += r.size;
  let bytes = 0;
  for (const x of r) { usedBy.set(x, (usedBy.get(x) ?? 0) + 1); bytes += files.get(x)!.size; }
  perEntry.push({ e: e.replace(SRC, "src"), n: r.size, bytes });
}
const mb = (b: number) => `${(b / 1048576).toFixed(2)} MB`;
const all = [...files.values()].reduce((a, f) => a + f.size, 0);
console.log(`source files: ${files.size}, ${mb(all)}, app entries: ${entries.length}, total (entry x reachable module) pairs: ${totalReach}`);
console.log("\nBiggest files:");
for (const [p, f] of [...files].sort((a, b) => b[1].size - a[1].size).slice(0, top)) console.log(`  ${mb(f.size).padStart(9)}  ${String(usedBy.get(p) ?? 0).padStart(4)} entries  ${p.replace(SRC, "src")}`);
console.log("\nLargest modules by (size x number of entries that statically reach them):");
for (const [p, n] of [...usedBy].map(([p, n]) => [p, n * files.get(p)!.size] as const).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${mb(n).padStart(10)}  ${String(usedBy.get(p)).padStart(4)} entries  ${p.replace(SRC, "src")}`);
console.log("\nEntries reaching the most code:");
for (const x of perEntry.sort((a, b) => b.bytes - a.bytes).slice(0, 12)) console.log(`  ${mb(x.bytes).padStart(9)}  ${String(x.n).padStart(5)} modules  ${x.e}`);

// Client components pull their whole static subtree into the browser bundle (and into the compile): list the heaviest.
const clients = [...files.keys()].filter((p) => /\.(tsx?|jsx?)$/.test(p) && /^\s*["']use client["']/.test(readFileSync(p, "utf8").slice(0, 200)));
const clientBytes = clients.map((c) => { const r = reach(c); let b = 0; for (const x of r) b += files.get(x)!.size; return { c: c.replace(SRC, "src"), n: r.size, b }; }).sort((a, b) => b.b - a.b).slice(0, 12);
console.log(`\nHeaviest client components (static subtree, ${clients.length} client modules in total):`);
for (const x of clientBytes) console.log(`  ${mb(x.b).padStart(9)}  ${String(x.n).padStart(5)} modules  ${x.c}`);
// Server-only modules reached from client components would be a bug (and bloat).
const serverOnly = [...files.keys()].filter((p) => /\.(tsx?)$/.test(p) && /^import ["']server-only["']/m.test(readFileSync(p, "utf8")));
let leaks = 0;
for (const c of clients) { const r = reach(c); for (const s of serverOnly) if (r.has(s)) { leaks++; if (leaks <= 5) console.log(`  server-only leak: ${c.replace(SRC, "src")} -> ${s.replace(SRC, "src")}`); } }
console.log(`client components that statically reach a server-only module: ${leaks}`);
