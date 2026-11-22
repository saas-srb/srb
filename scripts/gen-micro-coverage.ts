/**
 * Prints the pages, route handlers and server actions of a product as a coverage-map skeleton. Guards are filled in from the micro keys each item's
 * code already mentions; items with none print TODO (decide: a guard, or an `open` reason).
 * Usage: npx tsx scripts/gen-micro-coverage.ts <product-slug> <root> [<root> ...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { microOf } from "../src/lib/access/micro";
const [product, ...roots] = process.argv.slice(2);
const short = microOf(product).map((m) => m.key.slice(product.length + 1));
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const guard = (text: string) => { const k = short.filter((s) => text.includes(`"${s}"`)); return k.length ? `{ any: [${k.map((x) => `"${x}"`).join(", ")}] }` : "TODO"; };
for (const root of roots) for (const f of walk(root)) {
  const b = f.split("/").pop()!; const rel = relative("src/app/(products)", f);
  const text = readFileSync(f, "utf8");
  if (b === "page.tsx" || b === "route.ts") console.log(`  "${rel}": ${guard(text)},`);
  else if (/(^actions.*|-actions)\.ts$/.test(b)) {
    const fns = [...text.matchAll(/export async function (\w+)/g)];
    fns.forEach((m, i) => console.log(`  "${rel}#${m[1]}": ${guard(text.slice(m.index!, fns[i + 1]?.index ?? text.length))},`));
  }
}
