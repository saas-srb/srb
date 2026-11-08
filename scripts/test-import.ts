/**
 * CSV import checks (parsing, column mapping, dry run, duplicates, row
 * errors, caps, seat limit, invitations) against a throwaway database that
 * is dropped at the end. No email leaves the machine (console email adapter).
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/p35_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-import.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { previewImport, runImport } from "@/lib/platform/import";
import { IMPORT_DEFS, IMPORT_MAX_ROWS, IMPORT_TYPES, autoMap, csvEscape, parseCsv, sampleCsv, type ImportOutcome, type ImportPreview } from "@/lib/platform/import/shared";
import { listEvents } from "@/lib/platform/events";
import { acceptInvitation, listPendingInvitations } from "@/lib/platform/invitations";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function ok<T extends { ok: boolean }>(r: T | { ok: false; error: string }): T {
  assert.ok(r.ok, "error" in r ? r.error : "expected ok");
  return r as T;
}
const lines = (issues: { line: number }[]) => issues.map((i) => i.line);

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  delete process.env.OPENAI_API_KEY;
  // Capture what the console email adapter "sends".
  const mailed: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (/invited to join|\/workspace\/invite\?token=/.test(text)) mailed.push(text);
    else if (!/^\[email/.test(text)) realLog(...args);
  };

  const now = new Date();
  const A = randomUUID(); // unlimited
  const B = randomUUID();
  const TINY = randomUUID(); // 3 seats
  const SUSP = randomUUID();
  const company = (id: string, slug: string) => ({ _id: id as never, slug, name: slug[0].toUpperCase() + slug.slice(1), status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await db.collection("companies").insertMany([company(A, "alpha"), company(B, "beta"), company(TINY, "tiny"), company(SUSP, "susp")]);
  await listPlans();
  await db.collection("billing_plans").insertOne({ _id: "tiny" as never, name: "Tiny", description: "test", currency: "INR", priceMonthly: 100, priceYearly: 1000, modules: "all", limits: { seats: 3, aiTokensPerMonth: 1000, storageMb: 10 }, trialDays: 30, active: true, isDefault: false, sortOrder: 99, createdAt: now, updatedAt: now });
  const sub = (planId: string, status: string) => ({ subscription: { planId, status, interval: "monthly", trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now } });
  await db.collection("companies").updateOne({ _id: TINY as never }, { $set: sub("tiny", "active") });
  // The default plan is Free (one person); the import checks need a company with room, so A and B are on Business.
  await db.collection("companies").updateMany({ _id: { $in: [A, B] as never[] } }, { $set: sub("business", "active") });
  await db.collection("companies").updateOne({ _id: SUSP as never }, { $set: sub("growth", "suspended") });

  const actorId = new ObjectId();
  const actor = { id: String(actorId), email: "owner@alpha.test" };
  for (const id of [A, B, TINY, SUSP]) {
    await runAsCompany(id, async () => {
      await (await getDb()).collection("admin_users").insertOne({ _id: new ObjectId(id === A ? actorId : undefined), email: "owner@alpha.test", roles: ["super_admin"], createdAt: now });
    });
  }
  const ORIGIN = "http://alpha.localhost:3000";
  const req = (type: string, csv: string, extra: Record<string, unknown> = {}) => {
    const headers = parseCsv(csv)[0] ?? [];
    return { type, csv, mapping: autoMap(type as never, headers), ...extra };
  };

  console.log("CSV parsing and mapping");
  await check("quotes, embedded commas / newlines / quotes, CRLF, BOM, blank lines", () => {
    const csv = '﻿Name,Notes\r\n"Verma, Asha","said ""hi""\nand left"\r\n\r\nRohit,plain\n';
    assert.deepEqual(parseCsv(csv), [
      ["Name", "Notes"],
      ["Verma, Asha", 'said "hi"\nand left'],
      ["Rohit", "plain"],
    ]);
    assert.deepEqual(parseCsv(""), []);
    assert.deepEqual(parseCsv("a,b"), [["a", "b"]]);
    assert.deepEqual(parseCsv("a,,c\n"), [["a", "", "c"]]);
  });
  await check("columns auto-map by header, whatever the spelling or order", () => {
    assert.deepEqual(autoMap("leads", ["Phone Number", "E-mail", "Full Name", "Notes", "Something else"]), { name: 2, email: 1, phone: 0, message: 3 });
    assert.deepEqual(autoMap("employees", ["First Name", "Last Name", "Email", "Mobile", "Date of Joining"]), { firstName: 0, lastName: 1, workEmail: 2, phone: 3, joiningDate: 4, city: -1 });
    const clients = autoMap("clients", ["Company", "Contact name", "Contact email", "Phone", "City"]);
    assert.equal(clients.companyName, 0);
    assert.equal(clients.contactName, 1);
    assert.equal(clients.contactEmail, 2);
    assert.equal(clients.contactPhone, 3);
    assert.equal(clients.billingCity, 4);
    assert.equal(clients.website, -1);
    const once = autoMap("clients", ["Name", "Email"]);
    assert.equal(new Set(Object.values(once).filter((i) => i >= 0)).size, Object.values(once).filter((i) => i >= 0).length, "a column maps to one field only");
  });
  await check("each type has a sample CSV that maps and validates cleanly", async () => {
    assert.deepEqual([...IMPORT_TYPES], ["leads", "clients", "employees"]);
    for (const type of IMPORT_TYPES) {
      const csv = sampleCsv(type);
      const table = parseCsv(csv);
      assert.equal(table.length, 3, `${type}: header + 2 rows`);
      const mapping = autoMap(type, table[0]);
      for (const f of IMPORT_DEFS[type].fields) assert.ok(mapping[f.key] >= 0, `${type}.${f.key} maps from the sample header`);
      const p = ok<ImportPreview>(await runAsCompany(B, () => previewImport({ type, csv, mapping })));
      assert.equal(p.valid, 2, `${type} sample rows are valid: ${JSON.stringify(p.errors)}`);
    }
    assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)", "formula cells are neutralised");
    assert.equal(csvEscape("+91 98765 43210"), "+91 98765 43210", "phone numbers are left alone");
    assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  });

  console.log("dry run");
  const leadsCsv = ["Name,Email,Phone,Notes", "Asha Verma,asha@example.com,+91 98765 43210,Needs an app", "No Email,,+91 90000 00001,", "Bad Phone,bad@example.com,abc,", "Rohit Shah,rohit@example.com,+91 90000 00002,", "Asha Again,ASHA@example.com,+91 90000 00003,", "Same Phone,other@example.com,+91 90000 00002,"].join("\n");
  await check("valid rows, per-row errors, duplicates within the file — and nothing is written", async () => {
    const p = ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("leads", leadsCsv))));
    assert.equal(p.total, 6);
    assert.equal(p.valid, 2);
    assert.deepEqual(lines(p.errors), [3, 4]);
    assert.match(p.errors[0].messages.join(" "), /Email is required/);
    assert.match(p.errors[1].messages.join(" "), /valid phone/);
    assert.deepEqual(lines(p.duplicates), [6, 7]);
    assert.match(p.duplicates[0].messages[0], /Same email as line 2/);
    assert.match(p.duplicates[1].messages[0], /Same phone as line 5/);
    await runAsCompany(A, async () => {
      const d = await getDb();
      assert.equal(await d.collection("lead_records").countDocuments({}), 0);
      assert.equal(await d.collection("external_users").countDocuments({}), 0);
      assert.equal((await listEvents()).total, 0);
    });
  });
  await check("bad requests are refused with a clear message", async () => {
    const bad = async (r: unknown, re: RegExp) => {
      const res = await runAsCompany(A, () => previewImport(r as never));
      assert.ok(!res.ok && re.test(res.error), `expected ${re}, got ${JSON.stringify(res)}`);
    };
    await bad({ type: "invoices", csv: leadsCsv, mapping: {} }, /leads, clients or employees/);
    await bad({ type: "leads", csv: "", mapping: {} }, /empty/);
    await bad({ type: "leads", csv: "Name,Email,Phone", mapping: {} }, /header row and at least one row/);
    await bad({ type: "leads", csv: leadsCsv, mapping: { name: 0, email: 1 } }, /which column holds "Phone"/);
    await bad({ type: "leads", csv: leadsCsv, mapping: { name: 0, email: 1, phone: 99 } }, /which column holds "Phone"/);
    await bad({ type: "leads", csv: leadsCsv, mapping: { name: 0, email: 0, phone: 2 } }, /more than one field/);
    await bad({ type: "leads", csv: { $ne: "" }, mapping: {} }, /empty/);
    const many = ["Name,Email,Phone", ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `P${i},p${i}@example.com,+91 9${String(i).padStart(9, "0")}`)].join("\n");
    await bad(req("leads", many), /limit is 1,000/);
    await bad(req("leads", `Name,Email,Phone\nA,a@b.co,${"9".repeat(2 * 1024 * 1024)}`), /larger than 2 MB/);
    const max = ["Name,Email,Phone", ...Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => `P${i},p${i}@example.com,+91 9${String(i).padStart(9, "0")}`)].join("\n");
    assert.equal(ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("leads", max)))).valid, IMPORT_MAX_ROWS, "exactly 1,000 rows is fine");
  });

  console.log("import: leads");
  await check("valid rows are created through the CRM's own lead function; bad and duplicate rows are skipped", async () => {
    const r = ok<ImportOutcome>(await runAsCompany(A, () => runImport(req("leads", leadsCsv, { leadType: "trainee" }), actor, ORIGIN)));
    assert.equal(r.created, 2);
    assert.equal(r.failed.length, 0);
    assert.deepEqual(lines(r.errors), [3, 4]);
    assert.deepEqual(lines(r.duplicates), [6, 7]);
    await runAsCompany(A, async () => {
      const d = await getDb();
      const leads = await d.collection("lead_records").find({}).sort({ code: 1 }).toArray();
      assert.deepEqual(leads.map((l) => l.name), ["Asha Verma", "Rohit Shah"]);
      assert.match(leads[0].code, /^LEAD-\d{4}-/);
      assert.equal(leads[0].type, "trainee");
      assert.equal(leads[0].source, "manual");
      assert.equal(leads[0].message, "Needs an app");
      assert.equal(leads[0].createdBy, actor.id);
      assert.equal(await d.collection("external_users").countDocuments({}), 2, "each lead has the account record the pipeline links to");
      // Quiet import: no wallet bonus, no welcome notification or chat message for the lead.
      const { getPlatformDb } = await import("@/lib/platform/tenancy/platform-db");
      const raw = await getPlatformDb();
      for (const c of await raw.listCollections().toArray()) {
        if (!/wallet_(transactions|ledger|entries)|notification|chat|message/i.test(c.name)) continue;
        assert.equal(await raw.collection(c.name).countDocuments({ companyId: A }), 0, `import is quiet: nothing written to ${c.name}`);
      }
      const events = await listEvents({ types: ["lead.created"] });
      assert.equal(events.total, 2, "events fired");
      assert.ok(events.items.every((e) => e.source === "import" && e.actorEmail === "owner@alpha.test"));
    });
  });
  await check("importing the same file again creates nothing (existing email / phone)", async () => {
    const p = ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("leads", leadsCsv))));
    assert.equal(p.valid, 0);
    assert.equal(p.duplicates.length, 4);
    assert.match(p.duplicates[0].messages.join(" "), /already exists/);
    const r = ok<ImportOutcome>(await runAsCompany(A, () => runImport(req("leads", leadsCsv), actor, ORIGIN)));
    assert.equal(r.created, 0);
    assert.equal(await runAsCompany(A, async () => (await getDb()).collection("lead_records").countDocuments({})), 2);
  });
  await check("an unknown lead type falls back to client; duplicates are per company", async () => {
    const r = ok<ImportOutcome>(await runAsCompany(B, () => runImport(req("leads", leadsCsv, { leadType: "admin" }), actor, ORIGIN)));
    assert.equal(r.created, 2, "company B doesn't see company A's leads as duplicates");
    await runAsCompany(B, async () => {
      assert.equal((await (await getDb()).collection("lead_records").findOne({ email: "asha@example.com" }))?.type, "client");
    });
    assert.equal(await runAsCompany(A, async () => (await getDb()).collection("lead_records").countDocuments({})), 2);
  });

  console.log("import: clients");
  await check("clients go through the Projects product's validator and create function, with an activity log entry", async () => {
    const csv = ["Company,Contact name,Contact email,Phone,Industry,Website", "Northwind,Ravi Kumar,ravi@nw.test,+91 98111 22334,Retail,https://nw.test", ",Nobody,,,,", "Bad Site,Sara,sara@bs.test,,,not-a-url", "Northwind Two,Ravi Again,RAVI@nw.test,,,"].join("\n");
    const p = ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("clients", csv))));
    assert.equal(p.valid, 1);
    assert.deepEqual(lines(p.errors), [3, 4]);
    assert.match(p.errors[0].messages.join(" "), /Company name is required/);
    assert.deepEqual(lines(p.duplicates), [5]);
    const r = ok<ImportOutcome>(await runAsCompany(A, () => runImport(req("clients", csv), actor, ORIGIN)));
    assert.equal(r.created, 1);
    await runAsCompany(A, async () => {
      const d = await getDb();
      const c = await d.collection("pms_clients").findOne({ companyName: "Northwind" });
      assert.match(c?.clientCode ?? "", /^CLI/);
      assert.equal(c?.primaryContact.email, "ravi@nw.test");
      assert.equal(c?.industry, "Retail");
      assert.equal(c?.createdBy, actor.id);
      assert.equal(await d.collection("pms_activity_logs").countDocuments({ entity: "client", action: "create" }), 1);
      assert.equal((await listEvents({ types: ["client.created"] })).total, 1);
    });
    const again = ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("clients", "Company,Contact name,Contact email\nOther Co,Ravi,Ravi@NW.test"))));
    assert.equal(again.valid, 0, "an existing contact email is a duplicate, whatever its case");
  });

  console.log("import: employees");
  const empCsv = ["First Name,Last Name,Work Email,Phone,Joining Date,City", "Meera,Nair,meera@alpha.test,+91 90000 11111,2025-04-01,Kochi", "Arjun,Mehta,arjun@alpha.test,,2025-06-15,", "Bad,Date,bad@alpha.test,,15/06/2025,", ",NoFirst,nofirst@alpha.test,,,", "Zed,Third,zed@alpha.test,,,"].join("\n");
  await check("no invitation emails unless the box is ticked", async () => {
    mailed.length = 0;
    const p = ok<ImportPreview>(await runAsCompany(A, () => previewImport(req("employees", empCsv))));
    assert.equal(p.valid, 3);
    assert.deepEqual(lines(p.errors), [4, 5]);
    assert.equal(p.seatsFree, null);
    assert.match(p.notes.join(" "), /No invitation emails will be sent/);
    const r = ok<ImportOutcome>(await runAsCompany(A, () => runImport(req("employees", empCsv), actor, ORIGIN)));
    assert.equal(r.created, 3);
    assert.equal(r.invited, 0);
    assert.equal(mailed.length, 0, "nothing was emailed");
    await runAsCompany(A, async () => {
      const d = await getDb();
      const emps = await d.collection("hrms_employees").find({}).sort({ employeeCode: 1 }).toArray();
      assert.deepEqual(emps.map((e) => e.workEmail), ["meera@alpha.test", "arjun@alpha.test", "zed@alpha.test"]);
      assert.equal(emps[0].personal.phone, "+91 90000 11111");
      assert.equal(emps[0].personal.city, "Kochi");
      assert.equal(emps[0].professional.joiningDate, "2025-04-01");
      assert.equal(emps[0].adminUserId, null, "a record, not a login");
      assert.equal((await listPendingInvitations()).length, 0);
      assert.equal(await d.collection("admin_users").countDocuments({}), 1, "no accounts were created");
      assert.equal(await d.collection("hrms_audit_logs").countDocuments({ entity: "employee", action: "create" }), 3);
      assert.equal((await listEvents({ types: ["employee.created"] })).total, 3);
    });
    // `sendInvites` must be exactly true — a truthy string from a tampered request doesn't count.
    const sneaky = ok<ImportPreview>(await runAsCompany(B, () => previewImport(req("employees", empCsv, { sendInvites: "true" }))));
    assert.match(sneaky.notes.join(" "), /No invitation emails will be sent/);
  });
  await check("with invitations, the plan's seat limit decides how many are sent", async () => {
    mailed.length = 0;
    await runAsCompany(TINY, async () => {
      assert.equal(await countSeatsUsed(), 1, "the owner");
      const p = ok<ImportPreview>(await previewImport(req("employees", empCsv, { sendInvites: true })));
      assert.equal(p.valid, 3);
      assert.equal(p.seatsFree, 2);
      assert.match(p.notes.join(" "), /2 free user seats: the first 2 employees will be invited/);

      const r = ok<ImportOutcome>(await runImport(req("employees", empCsv, { sendInvites: true }), actor, ORIGIN));
      assert.equal(r.created, 3, "employee records don't use seats");
      assert.equal(r.invited, 2);
      assert.deepEqual(lines(r.inviteIssues), [6]);
      assert.match(r.inviteIssues[0].messages[0], /plan includes 3 users/);
      assert.deepEqual((await listPendingInvitations()).map((i) => i.email).sort(), ["arjun@alpha.test", "meera@alpha.test"]);
      assert.equal(await countSeatsUsed(), 1, "an invitation isn't an account until accepted");
    });
    assert.equal(mailed.filter((m) => /\/workspace\/invite\?token=/.test(m)).length >= 2, true, "invitation emails went out for the two seats");
    assert.ok(mailed.some((m) => m.includes(`${ORIGIN}/commandos/invite?token=`)), "the link points at this workspace");

    const full = ok<ImportPreview>(await runAsCompany(TINY, () => previewImport(req("employees", "First Name,Last Name,Email\nNew,Person,new@alpha.test", { sendInvites: true }))));
    assert.equal(full.seatsFree, 0);
    assert.match(full.notes.join(" "), /no free user seats/);
  });
  await check("accepting an invitation links the imported employee instead of creating a second one", async () => {
    const link = mailed.map((m) => /\/workspace\/invite\?token=([0-9a-f]{64})/.exec(m)).find((m) => m && true);
    assert.ok(link, "an invitation link was emailed");
    await runAsCompany(TINY, async () => {
      const d = await getDb();
      const before = await d.collection("hrms_employees").countDocuments({});
      const accepted = await acceptInvitation(link[1], { name: "Meera Nair", password: "a-long-password-1" });
      assert.ok(accepted.ok, "error" in accepted ? accepted.error : "");
      assert.equal(await d.collection("hrms_employees").countDocuments({}), before, "no duplicate employee");
      const account = await d.collection("admin_users").findOne({ _id: accepted.adminId });
      const employee = await d.collection("hrms_employees").findOne({ workEmail: account?.email });
      assert.equal(account?.employeeId, employee?._id, "the login is linked to the imported record");
      assert.equal(employee?.adminUserId, account?.email);
      assert.equal(await countSeatsUsed(), 2);
    });
  });

  console.log("limits and safety");
  await check("a read-only (suspended) workspace can preview but not import", async () => {
    assert.ok((await runAsCompany(SUSP, () => previewImport(req("leads", leadsCsv)))).ok);
    const r = await runAsCompany(SUSP, () => runImport(req("leads", leadsCsv), actor, ORIGIN));
    assert.ok(!r.ok && /read-only/.test(r.error));
    assert.equal(await runAsCompany(SUSP, async () => (await getDb()).collection("lead_records").countDocuments({})), 0);
  });
  await check("the importer re-validates: a tampered mapping can't smuggle bad rows in", async () => {
    const r = ok<ImportOutcome>(await runAsCompany(A, () => runImport({ type: "leads", csv: "Name,Email,Phone\nX,not-an-email,+91 90000 99999", mapping: { name: 0, email: 1, phone: 2 } }, actor, ORIGIN)));
    assert.equal(r.created, 0);
    assert.deepEqual(lines(r.errors), [2]);
  });
  await check("AI assistant without an OpenAI key answers with a friendly message", async () => {
    const { askBusiness } = await import("@/lib/platform/ai/assistant");
    const reply = await runAsCompany(A, () => askBusiness({ id: actor.id, email: actor.email, roles: ["super_admin"] }, "How many leads do we have?"));
    assert.ok(!reply.ok && /isn't set up/.test(reply.error), JSON.stringify(reply));
  });

  console.log = realLog;
  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    const d = c.db();
    if (/test/.test(d.databaseName)) await d.dropDatabase();
    await c.close();
  });
