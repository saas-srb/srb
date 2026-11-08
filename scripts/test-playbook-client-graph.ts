/**
 * Build-break guard: no Playbook "use client" file may reach a server-only module through its VALUE imports.
 *
 * Walks the import graph (static imports, re-exports and dynamic import()) from every "use client" file under the Playbook component, shared editor and
 * route folders. Type-only imports are erased by the compiler and are skipped. A file starting with "use server" is a server-action
 * boundary (the client gets a reference stub), so the walk stops there. Reaching a file that imports "server-only", the Mongo driver, a
 * Node built-in or the DB layer fails the build in Next, so it fails this test.
 *
 * Pure static analysis; touches no database and no network.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const SCAN_DIRS = [path.join(SRC, "components/products/playbook-ai"), path.join(SRC, "components/doc-editor"), path.join(SRC, "app/(products)/playbook-ai")];
/** Pure modules that client components import: they must be client-safe even when no client file reaches them yet. */
const CLIENT_SAFE_FILES = [
  ...walkSafe(path.join(SRC, "lib/products/playbook-ai/doc")).filter((f) => !/[\\/]hash\.ts$/.test(f) && !/[\\/]render[\\/]/.test(f)),
  path.join(SRC, "lib/playbook-roles.ts"),
  path.join(SRC, "lib/products/playbook-ai/pb-collections.ts"),
  path.join(SRC, "lib/products/playbook-ai/constants.ts"),
  path.join(SRC, "lib/products/playbook-ai/brand/types.ts"),
];
function walkSafe(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walkSafe(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const FORBIDDEN_PACKAGES = new Set(["mongodb", "server-only", "next/headers", "next/server", "sharp", "@napi-rs/canvas", ...builtinModules.flatMap((m) => [m, `node:${m}`])]);
const FORBIDDEN_ALIASES = [/^@\/lib\/mongodb$/, /^@\/lib\/platform\/tenancy\/scoped-db$/];

let failures = 0;
let checks = 0;
const ok = (c: boolean, msg: string) => {
  checks++;
  if (!c) {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
};

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
  }
  return out;
}

const directive = (src: string): "client" | "server" | null => {
  const m = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*(['"])(use client|use server)\1/.exec(src);
  return m ? (m[2] === "use client" ? "client" : "server") : null;
};

/** Value-import specifiers of a module (type-only imports/exports removed). */
export function valueImports(src: string): string[] {
  const out: string[] = [];
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const re = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*(['"])([^'"]+)\4|(?:^|[\n;])\s*import\s*(['"])([^'"]+)\6|\bimport\(\s*(['"])([^'"]+)\8\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m[5] !== undefined) {
      if (m[2]) continue;
      const clause = m[3].trim();
      // `import { type A, type B } from` has no runtime effect when every named import is a type.
      const named = /^\{([\s\S]*)\}$/.exec(clause);
      if (named && named[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => /^type\s/.test(s))) continue;
      out.push(m[5]);
    } else if (m[7] !== undefined) out.push(m[7]);
    else if (m[9] !== undefined) out.push(m[9]);
  }
  return out;
}

function resolveLocal(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const rel = (p: string) => path.relative(ROOT, p);

/** Returns the import chain to the first forbidden thing reached from `start`, or null. */
export function findLeak(start: string): string[] | null {
  const seen = new Set<string>();
  const stack: { file: string; chain: string[] }[] = [{ file: start, chain: [rel(start)] }];
  while (stack.length) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (file !== start && directive(src) === "server") continue; // server-action boundary
    for (const spec of valueImports(src)) {
      if (FORBIDDEN_PACKAGES.has(spec) || FORBIDDEN_ALIASES.some((r) => r.test(spec))) return [...chain, spec];
      const target = resolveLocal(spec, file);
      if (!target) continue;
      stack.push({ file: target, chain: [...chain, rel(target)] });
    }
  }
  return null;
}

console.log("playbook client import graph");
const clientFiles = SCAN_DIRS.flatMap((d) => walk(d)).filter((f) => directive(readFileSync(f, "utf8")) === "client");
ok(clientFiles.length > 10, `found the client files (${clientFiles.length})`);
ok(CLIENT_SAFE_FILES.length > 12, `found the client-safe model files (${CLIENT_SAFE_FILES.length})`);

// Self-check of the analyser, so the guard itself cannot silently rot.
{
  const imp = valueImports(`import type { A } from "x";\nimport { type B } from "y";\nimport { C } from "z";\nexport { D } from "w";\nexport type { E } from "v";\nconst f = () => import("dyn");`);
  ok(JSON.stringify(imp) === JSON.stringify(["z", "w", "dyn"]), `analyser keeps value imports only (${imp.join(",")})`);
  const stub = path.join(SRC, "lib/products/playbook-ai/doc/hash.ts");
  ok(readFileSync(stub, "utf8").includes('import "server-only"'), "hash.ts is still server-only (the regression this guards)");
  ok(findLeak(stub) !== null, "the analyser flags a server-only file");
}

// The PDF and DOCX renderers read fonts from disk and use Node-only libraries: they must stay server-only, and the client-safe barrel must not re-export them.
{
  const renderFiles = walkSafe(path.join(SRC, "lib/products/playbook-ai/doc/render"));
  ok(renderFiles.length >= 4, `found the renderer files (${renderFiles.length})`);
  for (const f of renderFiles) ok(/^\s*import "server-only";/m.test(readFileSync(f, "utf8")), `${rel(f)} must start with import "server-only"`);
  // Brand: everything except the pure types file touches the database, storage or Node APIs.
  const brandFiles = walkSafe(path.join(SRC, "lib/products/playbook-ai/brand")).filter((f) => !/[\\/]types\.ts$/.test(f));
  ok(brandFiles.length >= 5, `found the brand server files (${brandFiles.length})`);
  for (const f of brandFiles) ok(/^\s*import "server-only";/m.test(readFileSync(f, "utf8")), `${rel(f)} must start with import "server-only"`);
  const barrel = readFileSync(path.join(SRC, "lib/products/playbook-ai/doc/index.ts"), "utf8");
  ok(!/render\//.test(barrel), "the client-safe barrel (doc/index.ts) does not export the renderers");
}

for (const f of CLIENT_SAFE_FILES) {
  const leak = findLeak(f);
  ok(!leak, `${rel(f)} must be client-safe but reaches a server-only module: ${leak?.join(" -> ")}`);
}

for (const f of clientFiles) {
  const leak = findLeak(f);
  ok(!leak, `${rel(f)} reaches a server-only module: ${leak?.join(" -> ")}`);
}

console.log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nall ${checks} checks passed`);
process.exit(failures ? 1 : 0);
