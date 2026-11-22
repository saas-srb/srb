import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { hasRecognisedGuard } from "../src/lib/security/route-guard-scan";
import { OPEN_ROUTES } from "../src/lib/security/route-guard-allowlist";

// PERMANENT guard (P8-A): every route handler and server-action file has a recognised access check or an explicit, reasoned allowlist entry.
// A new unguarded file fails this test. Run: npx tsx scripts/test-guard-sweep.ts
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const APP = join(process.cwd(), "src/app");
const read = (p: string) => readFileSync(p, "utf8");
function* walk(d: string): Generator<string> { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(tsx?)$/.test(f)) yield p; } }

interface Row { rel: string; kind: "route" | "actions"; guarded: boolean; src: string }
const rows: Row[] = [];
for (const file of walk(APP)) {
  const base = file.split("/").pop()!;
  const src = read(file);
  const isRoute = /^route\.tsx?$/.test(base);
  const isActions = /^\s*["']use server["']/.test(src.slice(0, 300));
  if (isRoute || isActions) rows.push({ rel: relative(APP, file), kind: isRoute ? "route" : "actions", guarded: hasRecognisedGuard(src), src });
}

T("every route handler and server-action file has a recognised guard or an allowlist entry with a reason", () => {
  const stray = rows.filter((r) => !r.guarded && !(r.rel in OPEN_ROUTES)).map((r) => `${r.rel} (${r.kind})`);
  assert.deepEqual(stray, [], "guard it (requireAccess / the product's viewer / a signature / the cron secret) or add it to src/lib/security/route-guard-allowlist.ts with a reason");
  assert.ok(rows.length > 500, `${rows.length} files scanned`);
});
T("the allowlist is honest: every entry is a real file, has a reason, and is not a sensitive area dressed up as open", () => {
  for (const [rel, e] of Object.entries(OPEN_ROUTES)) {
    assert.ok(existsSync(join(APP, rel)), `${rel} does not exist: remove it from the allowlist`);
    assert.ok(e.reason.length >= 15, `${rel} needs a real reason`);
  }
  for (const rel of Object.keys(OPEN_ROUTES)) assert.ok(!/\/\(protected\)\//.test(rel) || OPEN_ROUTES[rel].kind === "guarded-by-wrapper", `${rel}: a protected area may only be listed when it is guarded by a project wrapper`);
});
T("a provider webhook verifies its caller: the route or the handler it calls mentions a signature, HMAC or verification", () => {
  for (const [rel, e] of Object.entries(OPEN_ROUTES).filter(([, x]) => x.kind === "provider-webhook")) {
    const src = read(join(APP, rel));
    const dir = join(APP, rel, "..");
    const libs = [
      ...[...src.matchAll(/from "@\/lib\/([^"]+)"/g)].map((m) => join("src/lib", `${m[1]}.ts`)),
      ...[...src.matchAll(/from "(\.{1,2}\/[^"]+)"/g)].map((m) => join(dir, `${m[1]}.ts`)),
    ].filter((p) => existsSync(p));
    const text = [src, ...libs.map(read)].join("\n");
    assert.match(text, /signature|hmac|verify|createHmac|timingSafeEqual/i, `${rel} (${e.reason})`);
  }
});
T("a cron route checks the cron secret (every one goes through cronRoute)", () => {
  for (const r of rows.filter((x) => /\/cron\/route\.ts$|expiry-sweep/.test(x.rel))) assert.ok(/cronRoute\(|CRON_SECRET|hasBearer\(|bearer/i.test(r.src), r.rel);
});
T("the sweep really detects: a file with no guard is flagged", () => {
  assert.equal(hasRecognisedGuard('export async function GET() { return Response.json(await loadAllLeads()); }'), false);
  assert.equal(hasRecognisedGuard('if (!(await requireLms("VIEW_LEADS"))) return deny();'), true);
  assert.equal(hasRecognisedGuard('return run(["MANAGE_POSTS"], async (v) => save(v));'), true);
});
T("the two real holes found by this sweep stay fixed: the DealFlow contacts route needs the view-leads feature; a draft visiting card is not served to anonymous visitors", () => {
  assert.match(read(join(APP, "(products)/api/dealflow-ai/contacts/route.ts")), /requireLms\("leads.view"\)/);
  assert.match(read(join(APP, "api/viralpulse-ai/vcard/[id]/pdf/route.ts")), /status !== "published"/);
});
console.log(`\n${passed} passed (${rows.length} route and action files)`);
