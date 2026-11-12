import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Customers must never see infrastructure wording (keys, deployments, Vercel, environment variables) and the key alerts live only in the staff
 * Platform Console. Pure file checks. Run with: npx tsx scripts/test-no-infra-leak.ts
 */
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("  ✓", name); };

const FORBIDDEN = /PLATFORM_ENCRYPTION_KEY|encryption key|keyring|deploy this code|environment variable|Vercel (account|project|dashboard|Cron|Blob)|on this deployment|this deployment|"[^"\n]*(MONGODB_URI|SAAS_HOSTS|SAAS_ADMIN)[^"\n]*"/i;

const files = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
};
/** Code with comments removed, line by line (strings and JSX text stay: they are what a customer reads). */
const code = (path: string): { n: number; text: string }[] => {
  const src = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return src.split("\n").map((l, i) => ({ n: i + 1, text: l.replace(/(^|\s)\/\/.*$/, "$1") })).filter((l) => !/^\s*(import|export \* from)\b/.test(l.text));
};

const CUSTOMER_DIRS = ["src/app/(products)", "src/components/products", "src/components/platform/saas", "src/app/(platform)/saas", "src/app/(platform)/signup", "src/lib/products"];
const CUSTOMER_FILES = ["src/lib/hub-auth.ts", "src/lib/security/two-factor.ts", "src/lib/security/email-otp.ts", "src/lib/security/second-step.ts", "src/lib/security/second-step-login.ts", "src/lib/security/second-step-actions.ts", "src/components/security/ReAuthGate.tsx", "src/components/security/TwoStepSettings.tsx", "src/lib/security/payment-auth.ts", "src/app/(products)/commandos/login/LoginForm.tsx", "src/app/(products)/commandos/login/page.tsx"];

t("no customer-visible file or message mentions keys, deployments, Vercel or environment variables", () => {
  const hits: string[] = [];
  for (const f of [...CUSTOMER_DIRS.flatMap((d) => files(d)), ...CUSTOMER_FILES]) {
    // Crypto helper modules hold internal developer errors that are never shown (they throw codes caught by callers).
    if (/\/crypto\.ts$/.test(f) || /\.test\./.test(f)) continue;
    for (const l of code(f)) if (FORBIDDEN.test(l.text)) hits.push(`${f}:${l.n}: ${l.text.trim().slice(0, 140)}`);
  }
  assert.deepEqual(hits, [], `customer-visible infrastructure wording:\n${hits.join("\n")}`);
});

t("the key mismatch banner is mounted only in the staff Console layout", () => {
  const users = files("src").filter((f) => readFileSync(f, "utf8").includes("KeyringBanner") && !f.endsWith("KeyringBanner.tsx"));
  assert.deepEqual(users, [join("src", "app", "(platform)", "console", "layout.tsx")]);
  const layout = readFileSync("src/app/(platform)/console/layout.tsx", "utf8");
  assert.ok(layout.includes("requirePlatformAccess"), "the Console layout is staff-gated");
});

t("the sign-in, setup and public pages mount no alert component", () => {
  for (const f of ["src/app/(products)/commandos/login/page.tsx", "src/app/(platform)/saas/setup/page.tsx", "src/app/(platform)/saas/layout.tsx"]) {
    try {
      const s = readFileSync(f, "utf8");
      assert.ok(!/KeyringBanner|SetupStatusCard/.test(s), `${f} must not show staff alerts`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
});

t("the second-step message customers get is calm and blame-free (no state names in responses)", () => {
  const hub = readFileSync("src/lib/security/second-step-login.ts", "utf8");
  assert.ok(hub.includes("We couldn't verify this code."));
  const action = readFileSync("src/app/(products)/commandos/login/actions.ts", "utf8");
  // the response carries only plain fields, never an internal state name
  assert.ok(!/key_mismatch|cannot_unwrap|needs_old_key/.test(action) && !/key_mismatch|cannot_unwrap|needs_old_key/.test(readFileSync("src/app/(products)/commandos/login/LoginForm.tsx", "utf8")));
});
console.log(`\n${n} passed`);
