// Marks one company as THE demo company (unlimited: no seat/module/storage limits, never read-only).
// Usage: node --env-file=.env.local scripts/mark-demo-company.mjs <slug> [--unset]
import { MongoClient } from "mongodb";

const slug = process.argv[2];
const unset = process.argv.includes("--unset");
if (!slug) { console.error("Usage: mark-demo-company.mjs <slug> [--unset]"); process.exit(1); }
const client = await MongoClient.connect(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DB || "testing");
const res = await db.collection("companies").updateOne({ slug, isPlatformOwner: { $ne: true } }, unset ? { $unset: { isDemo: "" } } : { $set: { isDemo: true } });
console.log(res.matchedCount ? `${unset ? "Unmarked" : "Marked"} "${slug}" as demo.` : `No such (non-owner) company: ${slug}`);
await client.close();
