import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { loadPipelineContactsFromDb } from "../src/lib/dealflow-ai/db-contacts";
import { getIntegrationsStatus } from "../src/lib/dealflow-ai/integrations";

// Runs only against a throwaway database (MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };

(async () => {
  await t("fake store and simulated sync routes are gone", async () => {
    for (const p of ["src/lib/dealflow-ai/store.ts", "src/app/(products)/api/dealflow-ai/integrations"]) assert.equal(existsSync(p), false, `${p} should be gone`);
    for (const p of ["src/lib/dealflow-ai/knowledge-base.ts", "src/app/(products)/dealflow-ai/(protected)/knowledge-base"]) assert.equal(existsSync(p), false, `${p} should be gone`);
  });

  await runAsCompany("co_a", async () => {
    const db = await getDb();
    assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    await (await getPlatformDb()).dropDatabase();
    const now0 = new Date();
    await (await getPlatformDb()).collection("companies").insertOne({ _id: "co_a", slug: "coa", name: "Co A", status: "active", isPlatformOwner: false, createdAt: now0, updatedAt: now0 } as never);

    await t("pipeline contacts carry no invented salary, company or campaign text", async () => {
      const now = new Date();
      await db.collection("career_applications").insertOne({ name: "Real Person", email: "r@x.test", phone: "1", positionTitle: "Accountant", status: "new", notes: "staff-only note", createdAt: now } as never);
      await db.collection("lead_records").insertMany([
        { type: "intern", name: "I", email: "i@x.test", phone: "2", stage: "applied", deletedAt: null, createdAt: now },
        { type: "trainee", name: "T", email: "t@x.test", phone: "3", stage: "applied", deletedAt: null, createdAt: now },
        { type: "client", name: "C", email: "c@x.test", phone: "4", stage: "inquiry", deletedAt: null, createdAt: now },
      ] as never[]);
      await db.collection("leads").insertMany([
        { name: "Meta lead", source: "meta_ads", createdAt: now },
        { name: "Valued", source: "website", dealValue: 90000, company: "Acme Ltd", createdAt: now },
      ] as never[]);
      const all = await loadPipelineContactsFromDb();
      assert.equal(all.length, 6);
      for (const c of all) {
        assert.equal(c.campaignInfo, undefined);
        assert.ok(!/LPA|Stipend|Enrollment/.test(c.budgetOrSalary ?? ""), "no invented pay text");
        assert.ok(!/College|University|Enterprise|Q4|Upwork Enterprise/.test(c.companyOrCollege ?? ""));
      }
      const job = all.find((c) => c.name === "Real Person")!;
      assert.equal(job.titleOrService, "Accountant");
      assert.equal(job.budgetOrSalary, undefined);
      assert.equal(job.companyOrCollege, undefined, "staff notes are not shown as the organisation");
      assert.equal(all.find((c) => c.name === "Valued")!.budgetOrSalary, "₹90,000");
      assert.equal(all.find((c) => c.name === "Valued")!.companyOrCollege, "Acme Ltd");
      assert.equal(all.find((c) => c.name === "Meta lead")!.budgetOrSalary, undefined);
      assert.equal(all.find((c) => c.name === "Meta lead")!.sourceLabel, "Meta");
    });

    await t("integrations status reports real counts and honest connection state", async () => {
      await db.collection("job_positions").insertMany([{ isOpen: true, title: "A" }, { isOpen: false, title: "B" }] as never[]);
      const s = await getIntegrationsStatus();
      assert.equal(s.website.openJobPositions, 1);
      assert.equal(s.website.totalApplications, 1);
      assert.ok(s.website.lastApplicationReceivedAt);
      assert.equal(s.connections.meta.connected, false);
      assert.equal(s.connections.meta.source, null);
      assert.equal(s.connections.whatsapp.connected, false);
      assert.deepEqual(s.leadSources.map((x) => x.count).reduce((a, b) => a + b, 0), 3);
    });

    await (await getPlatformDb()).dropDatabase();
  });
  console.log("dealflow clean: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
