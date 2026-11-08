// Writes the `crons` of vercel.json from the registry (src/lib/cron/registry.ts), keeping everything else in the file.
//   npm run cron:sync          rewrite vercel.json
//   npm run cron:sync -- --check   exit 1 if vercel.json is out of date (for CI)
import { readFileSync, writeFileSync } from "node:fs";
import { vercelCrons } from "../src/lib/cron/registry";

const file = "vercel.json";
const current = JSON.parse(readFileSync(file, "utf8")) as { crons?: unknown };
const next = JSON.stringify({ ...current, crons: vercelCrons() }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== next) {
    console.error("vercel.json is out of date with src/lib/cron/registry.ts. Run: npm run cron:sync");
    process.exit(1);
  }
  console.log("vercel.json matches the cron registry");
} else {
  writeFileSync(file, next);
  console.log(`vercel.json: ${vercelCrons().length} crons written`);
}
