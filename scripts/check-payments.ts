/**
 * Reads one company's payment setup and says what is missing, before anyone relies on it. Read-only: it changes nothing and moves no money.
 *   npm run check:payments -- --company <slug>
 */
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { paymentHealth } from "@/lib/products/cashflow-ai/payment-health";

const slug = process.argv.includes("--company") ? process.argv[process.argv.indexOf("--company") + 1] : null;
(async () => {
  if (!slug) { console.error("✗ Pass --company <slug>."); process.exit(1); }
  const company = await (await getPlatformDb()).collection("companies").findOne({ slug });
  if (!company) { console.error(`✗ No company "${slug}".`); process.exit(1); }
  const checks = await runAsCompany(String(company._id), () => paymentHealth());
  const mark = { ok: "✓", warn: "!", fail: "✗" } as const;
  console.log(`Payment setup for "${company.name}"\n`);
  for (const c of checks) console.log(`${mark[c.level]} ${c.title}\n    ${c.detail}`);
  const fails = checks.filter((c) => c.level === "fail").length;
  console.log(`\n${fails ? `${fails} thing(s) must be fixed before money can move.` : "Nothing blocks payments."}`);
  process.exit(fails ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
