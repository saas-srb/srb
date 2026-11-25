/**
 * Product-setting defaults migration (see src/lib/platform/defaults/product/migration.ts). Dry run unless --apply or --revert.
 * Refuses any database whose name does not contain "test" or "throwaway".
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/my_throwaway_copy npm run migrate:product-defaults [-- --apply | --revert]
 */
async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const name = uri ? new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).pathname.slice(1) : "";
  if (!/test|throwaway/i.test(name)) throw new Error(`Refusing to run: MONGODB_URI must name a throwaway database (its name must contain "test" or "throwaway"; got "${name || "(none)"}").`);
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !["--dry-run", "--apply", "--revert"].includes(a));
  if (unknown.length || (args.includes("--apply") && args.includes("--revert"))) throw new Error("Use one of --dry-run (default), --apply or --revert.");
  const mode = args.includes("--apply") ? "apply" : args.includes("--revert") ? "revert" : "dry-run";
  const { productDefaultsMigration } = await import("../src/lib/platform/defaults/product/migration");
  const { clientPromise } = await import("../src/lib/platform/tenancy/platform-db");
  try {
    console.log(`product defaults migration: ${mode} on ${name}`);
    console.table(await productDefaultsMigration(mode));
    if (mode === "dry-run") console.log("Nothing was written.");
  } finally {
    await (await clientPromise).close();
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
