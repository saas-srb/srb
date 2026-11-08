import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PAGE, parseDoc, resolveDoc, plainText, type PBDoc } from "../src/lib/products/playbook-ai/doc";
import {
  BUILTIN_VARIABLES, buildMissingReport, dateValues, indiaDateParts, isKnownVariable, resolveFromSnapshot, variableCatalogue, VARIABLE_NAMESPACES_USED,
} from "../src/lib/products/playbook-ai/variables-registry";
import { loadVariableValues, buildVariableSnapshot } from "../src/lib/products/playbook-ai/variables-adapters";
import { deleteCustomVariable, listCustomVariables, resetCustomVariableIndexes, saveCustomVariable } from "../src/lib/products/playbook-ai/variables-custom";
import {
  createDocument, getDocument, getDocumentVersion, getMissingDataReport, resetPbDocumentIndexes, saveDraft, transitionDocument,
} from "../src/lib/products/playbook-ai/documents";
import { resetPbVersionIndexes } from "../src/lib/products/playbook-ai/versions";
import { resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import type { PbActor } from "../src/lib/products/playbook-ai/documents-types";

// Runs only against a throwaway database: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. Run with the server-only shim.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = (id: string, roles: string[], name = id): PbActor => ({ id, name, email: `${id}@co.test`, roles, permissionOverrides: null });
const hr = actor("u_hr", ["sop_manager", "hr", "pms_admin", "procurement_manager"], "Hema HR");
const author = actor("u_author", ["sop_author"], "Ann Author");
const admin = actor("u_admin", ["sop_admin"], "Adam Admin");
const reader = actor("u_reader", ["sop_employee"], "Emma");

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = <T extends { ok: boolean }>(r: T, code: string) => {
  assert.equal(r.ok, false, "expected a failure");
  const e = (r as unknown as { error: { code: string } }).error;
  assert.equal(e.code, code, JSON.stringify(e));
  return e as Record<string, unknown> & { code: string };
};
const V = (key: string, extra: object = {}) => ({ type: "var", key, ...extra });
const mkDoc = (inline: unknown[]): PBDoc => {
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "paragraph", content: inline }] }, { assignIds: true });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.doc;
};
const txt = (s: string) => ({ type: "text", text: s });

(async () => {
  await t("registry (pure): keys unique, all valid in the PBDoc validator, namespaces covered", () => {
    const keys = BUILTIN_VARIABLES.map((v) => v.key);
    assert.equal(new Set(keys).size, keys.length);
    const doc = mkDoc(keys.map((k) => V(k)));
    assert.equal(doc.body.length, 1);
    for (const ns of ["company", "author", "employee", "client", "vendor", "candidate", "project", "doc", "date"]) assert.ok(keys.some((k) => k.startsWith(`${ns}.`)), ns);
    assert.deepEqual([...VARIABLE_NAMESPACES_USED].sort(), ["author", "candidate", "client", "company", "custom", "date", "doc", "employee", "input", "party", "project", "vendor"]);
    assert.ok(!keys.some((k) => /salary|bank|account|aadhaar|ifsc/i.test(k)), "no sensitive fields are offered as variables");
    assert.ok(isKnownVariable("input.anything") && isKnownVariable("employee.name") && !isKnownVariable("employee.salary") && !isKnownVariable("custom.nope"));
    assert.equal(variableCatalogue([{ key: "custom.x", label: "X", valueType: "text", value: "v" }]).length, keys.length + 1);
  });

  await t("date.* in Indian time and Indian financial year", () => {
    assert.equal(indiaDateParts(new Date("2026-03-31T10:00:00Z")).financialYear, "2025-26");
    assert.equal(indiaDateParts(new Date("2026-03-31T19:00:00Z")).iso, "2026-04-01", "19:00 UTC is already 1 April in India");
    assert.equal(indiaDateParts(new Date("2026-03-31T19:00:00Z")).financialYear, "2026-27");
    const d = dateValues(new Date("2026-11-03T00:00:00Z"));
    assert.deepEqual([d["date.today"], d["date.month"], d["date.year"], d["date.financial_year"]], ["2026-11-03", "November", "2026", "2026-27"]);
  });

  await t("missing-data report (pure): reasons, fallbacks, placeholders, conditions", () => {
    const doc = mkDoc([
      V("employee.name"), V("company.name"), V("company.cin", { fallback: "n/a" }), V("input.salary_words"), V("employee.nope"),
      V("project.start_date", { format: "date" }), { type: "placeholder", key: "input.reason", label: "Reason" },
    ]);
    const r = buildMissingReport({ doc, values: { "company.name": "Acme", "project.start_date": "not-a-date" }, links: { projectId: "p1" }, deniedNamespaces: [] });
    const by = Object.fromEntries(r.missing.map((m) => [m.key, m.reason]));
    assert.deepEqual(by, { "employee.name": "no_source_selected", "employee.nope": "unknown_variable", "input.salary_words": "no_value", "project.start_date": "bad_format" });
    assert.ok(!("company.cin" in by), "a variable with a fallback is never missing");
    assert.deepEqual(r.placeholders, [{ key: "input.reason", label: "Reason" }]);
    assert.equal(r.ok, false);
    const r2 = buildMissingReport({ doc: mkDoc([V("employee.nope")]), values: {}, links: { employeeId: "e1" } });
    assert.equal(r2.missing[0].reason, "unknown_variable");
    const r3 = buildMissingReport({ doc: mkDoc([V("employee.name")]), values: {}, links: { employeeId: "e1" }, deniedNamespaces: ["employee"] });
    assert.equal(r3.missing[0].reason, "no_access");
    assert.equal(buildMissingReport({ doc: mkDoc([V("company.name")]), values: { "company.name": "A" } }).ok, true);
  });

  const db0 = await runAsCompany("co_a", () => getDb());
  assert.ok(db0.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  resetPbDocumentIndexes(); resetPbVersionIndexes(); resetPbAuditIndexes(); resetCustomVariableIndexes();

  const stamp = { createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null, deletedAt: null };
  let docId = "";
  await runAsCompany("co_a", async () => {
    const db = await getDb();
    await db.collection("hrms_company").insertOne({ _id: "org", name: "Acme Pvt Ltd", legalName: "Acme Private Limited", addressLine1: "12 MG Road", addressLine2: "", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", email: "hr@acme.test", phone: "", website: "", pan: "ABCDE1234F", gstin: "", cin: "U12345MH2020PTC000001", tan: "", pfEstablishmentCode: "", esiEstablishmentCode: "", lin: "", ptRegistration: "", signatoryName: "S. Rao", signatoryDesignation: "Director", payslipNote: "", updatedAt: new Date(), updatedBy: null } as never);
    await db.collection("hrms_departments").insertOne({ _id: "d1", name: "Engineering", code: "ENG", ...stamp } as never);
    await db.collection("hrms_designations").insertOne({ _id: "g1", title: "Senior Engineer", departmentId: "d1", level: null, ...stamp } as never);
    const emp = (id: string, code: string, first: string, adminUserId: string | null, extra: object = {}) => ({
      _id: id, employeeCode: code, firstName: first, lastName: "Kumar", workEmail: `${first.toLowerCase()}@acme.test`, status: "active",
      personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: "9800000000", addressLine: "5 Park St", city: "Pune", state: "MH", postalCode: "411002", photoKey: null },
      professional: { departmentId: "d1", designationId: "g1", teamId: null, reportingManagerId: "e2", employmentType: "full_time", workLocation: "Pune", joiningDate: "2024-06-03", probationEndDate: null, relievingDate: null },
      emergencyContacts: [], recruitment: null, adminUserId, ...stamp, ...extra,
    });
    await db.collection("hrms_employees").insertMany([emp("e1", "E001", "Ravi", null), emp("e2", "E002", "Meera", "u_author")] as never[]);
    await db.collection("pms_clients").insertOne({ _id: "c1", clientCode: "CLI-1", companyName: "Globex Ltd", industry: null, website: null, status: "active", primaryContact: { name: "Gita", email: "gita@globex.test", phone: "9811111111", designation: "CTO" }, billing: { addressLine: "1 Ring Rd", city: "Delhi", country: "India", state: "Delhi", gstin: "07AAAAA0000A1Z5", currency: "INR", paymentTermsDays: 30 }, notes: null, tags: [], ...stamp } as never);
    await db.collection("prms_vendors").insertOne({ _id: "v1", vendorCode: "VEN-1", companyName: "Initech", gstin: "27BBBBB1111B1Z6", pan: "BBBBB1111B", contactPerson: "Bill", email: "bill@initech.test", phone: "9822222222", addressLine: "9 Lane", city: "Mumbai", state: "Maharashtra", pincode: "400001", bankDetails: { accountName: "I", accountNumber: "123456", ifsc: "X", bankName: "B", branch: "b" }, paymentTerms: "net_30", currency: "INR", category: "services", rating: null, status: "active", notes: null, ...stamp } as never);
    const appId = new ObjectId();
    await db.collection("career_applications").insertOne({ _id: appId, positionId: null, positionSlug: null, positionTitle: "Backend Developer", name: "Neha Singh", email: "neha@x.test", phone: "9833333333", status: "new", createdAt: new Date("2026-10-01T05:00:00Z"), updatedAt: new Date() } as never);
    await db.collection("pms_projects").insertOne({ _id: "p1", projectCode: "PRJ-1", name: "Portal rebuild", clientId: "c1", category: null, description: "Rebuild", priority: "medium", status: "active", startDate: "2026-07-01", endDate: "2026-12-31", estimatedBudget: 1250000, estimatedHours: null, currency: "INR", projectManagerId: "e2", technologies: [], progressPercent: 0, ...stamp } as never);

    await t("loadVariableValues: real company profile, author, date, doc and linked records (HR)", async () => {
      const l = await loadVariableValues(hr, {
        doc: { title: "Offer", docNumber: null, version: 3, status: "draft", issuedAt: null, authorId: "u_hr" },
        links: { employeeId: "e1", clientId: "c1", vendorId: "v1", candidateId: String(appId), projectId: "p1" },
        inputs: { "input.joining_bonus": 50000, notice: "30 days" }, now: new Date("2026-11-03T05:00:00Z"),
      });
      const v = l.values;
      assert.equal(v["company.legal_name"], "Acme Private Limited");
      assert.equal(v["company.address"], "12 MG Road, Pune, Maharashtra, 411001, India");
      assert.equal(v["company.cin"], "U12345MH2020PTC000001");
      assert.equal(v["author.name"], "Hema HR");
      assert.equal(v["employee.name"], "Ravi Kumar");
      assert.equal(v["employee.designation"], "Senior Engineer");
      assert.equal(v["employee.department"], "Engineering");
      assert.equal(v["employee.joining_date"], "2024-06-03");
      assert.equal(v["employee.reporting_manager"], "Meera Kumar");
      assert.equal(v["client.name"], "Globex Ltd"); assert.equal(v["client.payment_terms_days"], 30);
      assert.equal(v["vendor.gstin"], "27BBBBB1111B1Z6");
      assert.equal(v["candidate.name"], "Neha Singh"); assert.equal(v["candidate.position"], "Backend Developer");
      assert.equal(v["project.budget"], 1250000); assert.equal(v["project.manager"], "Meera Kumar"); assert.equal(v["project.client_name"], "Globex Ltd");
      assert.equal(v["input.joining_bonus"], 50000); assert.equal(v["input.notice"], "30 days");
      assert.equal(v["doc.version"], 3); assert.equal(v["date.financial_year"], "2026-27");
      assert.deepEqual(l.denied, []);
      assert.ok(l.sources.some((s) => s.kind === "employee" && s.id === "e1"));
      assert.ok(!Object.keys(v).some((k) => /account|ifsc|bank/i.test(k)), "vendor bank details are never exposed");
    });

    await t("permission checks: an author without HR cannot read another employee, but can read themselves as author", async () => {
      const l = await loadVariableValues(author, { doc: { title: "T", docNumber: null, version: 1, status: "draft", issuedAt: null, authorId: "u_author" }, links: { employeeId: "e1", clientId: "c1", vendorId: "v1", candidateId: String(new ObjectId()), projectId: "p1" }, inputs: {} });
      assert.deepEqual([...l.denied].sort(), ["candidate", "client", "employee", "project", "vendor"]);
      assert.equal(l.values["employee.name"], undefined);
      assert.equal(l.values["client.name"], undefined);
      assert.equal(l.values["company.name"], "Acme Pvt Ltd");
      assert.equal(l.values["author.designation"], "Senior Engineer", "the author's own employee record fills author.*");
      assert.equal(l.values["author.department"], "Engineering");
      const own = await loadVariableValues(author, { doc: { title: "T", docNumber: null, version: 1, status: "draft", issuedAt: null, authorId: "u_author" }, links: { employeeId: "e2" }, inputs: {} });
      assert.equal(own.values["employee.name"], "Meera Kumar", "an employee may read their own record");
      const rd = await loadVariableValues(reader, { doc: { title: "T", docNumber: null, version: 1, status: "draft", issuedAt: null, authorId: null }, links: {}, inputs: {} });
      assert.ok(rd.denied.includes("company") && rd.values["company.name"] === undefined, "a read-only user gets no source data");
    });

    await t("custom variables: permission, validation, uniqueness, soft delete, appear as custom.*", async () => {
      assert.equal((await saveCustomVariable(author, { name: "hr_head", label: "HR head", valueType: "text", value: "Hema" })).ok, false);
      assert.equal((await saveCustomVariable(admin, { name: "Bad Name", label: "x", valueType: "text", value: "v" })).ok, false);
      assert.equal((await saveCustomVariable(admin, { name: "limit", label: "Limit", valueType: "number", value: "abc" })).ok, false);
      assert.equal((await saveCustomVariable(admin, { name: "since", label: "Since", valueType: "date", value: "2026-13-40" })).ok, false);
      const a = await saveCustomVariable(admin, { name: "hr_head", label: "HR head", valueType: "text", value: "Hema Rao" });
      assert.ok(a.ok && a.key === "custom.hr_head");
      assert.equal((await saveCustomVariable(admin, { name: "hr_head", label: "Dup", valueType: "text", value: "x" })).ok, false);
      const m = await saveCustomVariable(hr, { name: "leave_cap", label: "Leave cap", valueType: "number", value: "24" });
      assert.ok(m.ok === false, "a manager does not have MANAGE_VARIABLES");
      assert.ok((await saveCustomVariable(admin, { name: "leave_cap", label: "Leave cap", valueType: "number", value: "24" })).ok);
      const edited = await saveCustomVariable(admin, { id: a.ok ? a.id : "", name: "hr_head", label: "HR head", valueType: "text", value: "Hema Rao-Singh" });
      assert.ok(edited.ok);
      const l = await loadVariableValues(hr, { doc: { title: "T", docNumber: null, version: 1, status: "draft", issuedAt: null, authorId: null }, links: {}, inputs: {} });
      assert.equal(l.values["custom.hr_head"], "Hema Rao-Singh"); assert.equal(l.values["custom.leave_cap"], 24);
      const del = await deleteCustomVariable(admin, a.ok ? a.id : "");
      assert.ok(del.ok);
      assert.deepEqual((await listCustomVariables()).map((c) => c.key), ["custom.leave_cap"]);
      assert.ok((await saveCustomVariable(admin, { name: "hr_head", label: "HR head again", valueType: "text", value: "Back" })).ok, "a deleted name can be reused");
    });

    const offer = [txt("Dear "), V("employee.name"), txt(", welcome to "), V("company.name"), txt(". Signed by "), V("custom.hr_head"), txt(" on "), V("date.today", { format: "date" }), txt(". Bonus: "), V("input.bonus", { format: "money" })];

    await t("document flow: missing report lists unresolved required variables and blocks issue", async () => {
      const d = ok(await createDocument(hr, { title: "Offer", pbdoc: mkDoc(offer), links: {} })).document;
      docId = d._id;
      const rep = ok(await getMissingDataReport(hr, docId)).report;
      assert.equal(rep.ok, false);
      assert.deepEqual(Object.fromEntries(rep.missing.map((m) => [m.key, m.reason])), { "employee.name": "no_source_selected", "input.bonus": "no_value" });
      ok(await transitionDocument(hr, { id: docId, transition: "submit" }));
      ok(await transitionDocument(hr, { id: docId, transition: "approve" }));
      const e = bad(await transitionDocument(hr, { id: docId, transition: "issue" }), "unresolved_variables");
      const keys = (e.report as { missing: { key: string }[] }).missing.map((m) => m.key).sort();
      assert.deepEqual(keys, ["employee.name", "input.bonus"]);
      assert.equal(ok(await getDocument(hr, docId)).document.status, "approved", "a failed issue changes nothing");
      ok(await transitionDocument(hr, { id: docId, transition: "revise" }));
    });

    await t("linking is not copying: the draft shows live data; no access is reported as no_access", async () => {
      const cur = ok(await getDocument(hr, docId)).document;
      ok(await saveDraft(hr, { id: docId, rev: cur.rev, pbdoc: cur.pbdoc, links: { employeeId: "e1" }, inputs: { "input.bonus": 50000 } }));
      assert.equal(ok(await getMissingDataReport(hr, docId)).report.ok, true);
      const rep = ok(await getMissingDataReport(admin, docId)).report; // admin has Playbook rights but no HR rights
      assert.ok(rep.missing.some((m) => m.key === "employee.name" && m.reason === "no_access"));
      const cur2 = ok(await getDocument(hr, docId)).document;
      assert.deepEqual(cur2.links, { employeeId: "e1" }, "only the id is stored, not the employee's data");
      assert.ok(!JSON.stringify(cur2).includes("Ravi"));
    });

    await t("SNAPSHOT: issuing freezes the values; later changes to the employee, company and custom variable do not touch the issued version", async () => {
      ok(await transitionDocument(hr, { id: docId, transition: "submit" }));
      ok(await transitionDocument(hr, { id: docId, transition: "approve" }));
      const iss = ok(await transitionDocument(hr, { id: docId, transition: "issue", assignNumber: async () => "OFR/2026-27/0001" }));
      const ver = ok(await getDocumentVersion(hr, docId, iss.version!.number)).version;
      const snap = ver.variableSnapshot!;
      assert.equal(snap.values["employee.name"], "Ravi Kumar");
      assert.equal(snap.values["company.name"], "Acme Pvt Ltd");
      assert.equal(snap.values["custom.hr_head"], "Back");
      assert.equal(snap.values["input.bonus"], 50000);
      assert.match(String(snap.values["date.today"]), /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(Object.keys(snap.values).sort(), ["company.name", "custom.hr_head", "date.today", "employee.name", "input.bonus"], "only the variables the document uses are frozen");
      assert.ok(snap.sources.some((s) => s.kind === "employee" && s.id === "e1"));
      // change the live data
      await db.collection("hrms_employees").updateOne({ _id: "e1" } as never, { $set: { firstName: "Changed" } });
      await db.collection("hrms_company").updateOne({ _id: "org" } as never, { $set: { name: "Renamed Co" } });
      await saveCustomVariable(admin, { id: (await db.collection("pb_variables").findOne({ key: "custom.hr_head", deletedAt: null }))!._id as unknown as string, name: "hr_head", label: "HR head", valueType: "text", value: "Someone Else" });
      const after = ok(await getDocumentVersion(hr, docId, iss.version!.number)).version;
      assert.deepEqual(after.variableSnapshot, snap, "the stored snapshot is unchanged");
      const rendered = plainText(resolveFromSnapshot(after.pbdoc, after.variableSnapshot!).doc);
      assert.match(rendered, /Dear Ravi Kumar, welcome to Acme Pvt Ltd\. Signed by Back on \d{2} \w{3} \d{4}\. Bonus: ₹ 50,000/);
      // live resolution moves on, the issued one does not
      const live = await loadVariableValues(hr, { doc: { title: "Offer", docNumber: null, version: 9, status: "draft", issuedAt: null, authorId: null }, links: { employeeId: "e1" }, inputs: { "input.bonus": 50000 } });
      assert.match(plainText(resolveDoc(after.pbdoc, { values: live.values }).doc), /Dear Changed Kumar, welcome to Renamed Co\. Signed by Someone Else/);
      // the live document report also reads the frozen snapshot once issued
      assert.equal(ok(await getMissingDataReport(hr, docId)).report.ok, true);
      assert.equal(buildVariableSnapshot(after.pbdoc, live, {}, new Date()).sha256.length, 64);
    });
  });

  await runAsCompany("co_b", async () => {
    await t("two companies: own profile, own custom variables, no access to company A's records", async () => {
      const db = await getDb();
      await db.collection("hrms_company").insertOne({ _id: "org", name: "Bravo LLP", legalName: "Bravo LLP", addressLine1: "", addressLine2: "", city: "Chennai", state: "TN", postalCode: "", country: "India", email: "", phone: "", website: "", pan: "", gstin: "", cin: "", tan: "", pfEstablishmentCode: "", esiEstablishmentCode: "", lin: "", ptRegistration: "", signatoryName: "", signatoryDesignation: "Authorised Signatory", payslipNote: "", updatedAt: new Date(), updatedBy: null } as never);
      assert.deepEqual(await listCustomVariables(), []);
      assert.ok((await saveCustomVariable(admin, { name: "hr_head", label: "HR head", valueType: "text", value: "Bala" })).ok, "the same name is free in another company");
      const l = await loadVariableValues(hr, { doc: { title: "T", docNumber: null, version: 1, status: "draft", issuedAt: null, authorId: null }, links: { employeeId: "e1", clientId: "c1" }, inputs: {} });
      assert.equal(l.values["company.name"], "Bravo LLP");
      assert.equal(l.values["custom.hr_head"], "Bala");
      assert.equal(l.values["employee.name"], undefined, "company A's employee is not visible");
      assert.deepEqual([...l.denied].sort(), ["client", "employee"]);
      bad(await getDocument(hr, docId), "not_found");
    });
  });
  await runAsCompany("co_a", async () => {
    await t("company A's custom variables are unaffected by company B", async () => {
      assert.equal((await listCustomVariables()).find((c) => c.key === "custom.hr_head")?.value, "Someone Else");
    });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log("test-pb-variables: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
