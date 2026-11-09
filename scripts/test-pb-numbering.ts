import assert from "node:assert/strict";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PAGE, parseDoc, type PBDoc } from "../src/lib/products/playbook-ai/doc";
import { createDocument, resetPbDocumentIndexes, setStatusPolicy, transitionDocument } from "../src/lib/products/playbook-ai/documents";
import { resetPbVersionIndexes } from "../src/lib/products/playbook-ai/versions";
import { resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import { NEUTRAL_STATUS_POLICY } from "../src/lib/products/playbook-ai/status";
import { DEFAULT_NUMBER_PATTERN, formatDocNumber, periodKey, validatePattern } from "../src/lib/products/playbook-ai/numbering-pattern";
import { allocateNumber, counterIdFor } from "../src/lib/products/playbook-ai/pb-numbering";
import { DEFAULT_SETTINGS, getPbSettings, numberingFor, savePbSettings } from "../src/lib/products/playbook-ai/pb-settings";
import { ALL_META } from "../src/lib/products/playbook-ai/catalogue/meta";
import type { PbActor } from "../src/lib/products/playbook-ai/documents-types";

// Runs only against a throwaway database: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. Run with the server-only shim.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = (id: string, roles: string[], name = id): PbActor => ({ id, name, email: `${id}@co.test`, roles, permissionOverrides: null });
const mona = actor("u_mona", ["sop_manager"], "Mona");
const adam = actor("u_adam", ["sop_admin"], "Adam");
const ann = actor("u_ann", ["sop_author"], "Ann");
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = <T extends { ok: boolean }>(r: T, code: string) => { assert.equal(r.ok, false); const e = (r as unknown as { error: { code: string } }).error; assert.equal(e.code, code, JSON.stringify(e)); return e as Record<string, unknown>; };
const body = (n = "x"): PBDoc => {
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "paragraph", content: [{ type: "text", text: n }] }] }, { assignIds: true });
  if (!r.ok) throw new Error("bad doc");
  return r.doc;
};
/** Creates a document and takes it to approved. */
async function approved(typeId: string | null = null): Promise<string> {
  const d = ok(await createDocument(mona, { title: "Doc", pbdoc: body(), docTypeId: typeId })).document;
  ok(await transitionDocument(mona, { id: d._id, transition: "submit" }));
  ok(await transitionDocument(mona, { id: d._id, transition: "approve" }));
  return d._id;
}
const num = (r: { document: { docNumber: string | null } }) => r.document.docNumber as string;

(async () => {
  await t("pattern: validation, tokens and the Indian financial year (pure)", () => {
    assert.ok(validatePattern(DEFAULT_NUMBER_PATTERN).ok);
    assert.ok(validatePattern("{PREFIX}-{YYYY}{MM}-{SEQ:5}").ok);
    for (const p of ["", "{PREFIX}/{FY}", "{SEQ}{SEQ}", "{FOO}/{SEQ}", "{SEQ:0}", "{SEQ:11}", "{FY:2}{SEQ}", "<b>{SEQ}", "{SEQ", "x".repeat(70) + "{SEQ}"]) assert.equal(validatePattern(p).ok, false, p);
    const d = new Date("2026-11-03T05:00:00Z");
    assert.equal(formatDocNumber(DEFAULT_NUMBER_PATTERN, "OFR", 7, d), "OFR/2026-27/0007");
    assert.equal(formatDocNumber("{PREFIX}-{YYYY}{MM}-{SEQ:5}", "INV", 42, d), "INV-202611-00042");
    assert.equal(formatDocNumber(DEFAULT_NUMBER_PATTERN, "X", 1, new Date("2027-03-31T10:00:00Z")), "X/2026-27/0001");
    assert.equal(formatDocNumber(DEFAULT_NUMBER_PATTERN, "X", 1, new Date("2027-03-31T19:00:00Z")), "X/2027-28/0001", "19:00 UTC on 31 March is 1 April in India");
    assert.equal(periodKey("{PREFIX}/{FY}/{SEQ}", d), "2026-27");
    assert.equal(periodKey("{PREFIX}/{YYYY}/{SEQ}", d), "2026");
    assert.equal(periodKey("{PREFIX}-{YYYY}{MM}-{SEQ}", d), "2026-11");
    assert.equal(periodKey("{PREFIX}-{SEQ}", d), "all");
  });

  const db0 = await runAsCompany("co_a", () => getDb());
  assert.ok(db0.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  resetPbDocumentIndexes(); resetPbVersionIndexes(); resetPbAuditIndexes();
  setStatusPolicy(NEUTRAL_STATUS_POLICY);

  await runAsCompany("co_a", async () => {
    const rule = numberingFor(DEFAULT_SETTINGS, null);
    const now = new Date("2026-11-03T05:00:00Z");

    await t("20 parallel allocations: 20 unique numbers, gapless 1..20", async () => {
      const all = await Promise.all(Array.from({ length: 20 }, () => allocateNumber(rule, now)));
      assert.deepEqual(all.map((a) => a.seq).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
      assert.equal(new Set(all.map((a) => a.number)).size, 20);
      assert.equal(all.find((a) => a.seq === 20)!.number, "DOC/2026-27/0020");
    });

    await t("a number that is given back is handed out again, lowest first, before the counter moves on", async () => {
      const a = await allocateNumber(rule, now); // 21
      const b = await allocateNumber(rule, now); // 22
      const c = await allocateNumber(rule, now); // 23
      await c.release(); await b.release(); await b.release(); // double release is harmless
      const x = await allocateNumber(rule, now), y = await allocateNumber(rule, now), z = await allocateNumber(rule, now);
      assert.deepEqual([x.seq, y.seq, z.seq], [22, 23, 24]);
      void a;
    });

    await t("a new financial year restarts at 1 (injected clock around 1 April)", async () => {
      const before = await allocateNumber(rule, new Date("2027-03-31T10:00:00Z"));
      const after = await allocateNumber(rule, new Date("2027-03-31T19:00:00Z"));
      assert.equal(before.number, "DOC/2026-27/0025");
      assert.equal(after.number, "DOC/2027-28/0001");
      assert.notEqual(before.counterId, after.counterId);
      assert.equal(counterIdFor(rule, new Date("2027-04-01T00:00:00Z")), "default:2027-28");
      assert.equal((await allocateNumber(rule, new Date("2027-12-01T00:00:00Z"))).number, "DOC/2027-28/0002");
    });
  });

  // Fresh company for the document flows so counters start at zero.
  await runAsCompany("co_n", async () => {
    await t("20 parallel issues give 20 unique, gapless numbers", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) ids.push(await approved());
      const issued = await Promise.all(ids.map((id) => transitionDocument(mona, { id, transition: "issue" })));
      const nums = issued.map((r) => num(ok(r)));
      assert.equal(new Set(nums).size, 20);
      const seqs = nums.map((n) => Number(n.split("/")[2])).sort((a, b) => a - b);
      assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1));
      assert.ok(nums.every((n) => /^DOC\/\d{4}-\d{2}\/\d{4}$/.test(n)));
    });

    await t("the same document issued by 6 people at once: one wins, the numbers it lost go back (no hole)", async () => {
      const id = await approved();
      const rs = await Promise.all(Array.from({ length: 6 }, () => transitionDocument(mona, { id, transition: "issue" })));
      assert.equal(rs.filter((r) => r.ok).length, 1);
      const winner = num(ok(rs.find((r) => r.ok)!));
      assert.equal(Number(winner.split("/")[2]), 21);
      const next = num(ok(await transitionDocument(mona, { id: await approved(), transition: "issue" })));
      assert.equal(Number(next.split("/")[2]), 22, "the next document continues straight on");
    });

    await t("reissuing after a revision keeps the number and uses none", async () => {
      const id = await approved();
      const first = num(ok(await transitionDocument(mona, { id, transition: "issue" })));
      ok(await transitionDocument(mona, { id, transition: "revise" }));
      ok(await transitionDocument(mona, { id, transition: "submit" }));
      ok(await transitionDocument(mona, { id, transition: "approve" }));
      assert.equal(num(ok(await transitionDocument(mona, { id, transition: "issue" }))), first);
      const next = num(ok(await transitionDocument(mona, { id: await approved(), transition: "issue" })));
      assert.equal(Number(next.split("/")[2]), Number(first.split("/")[2]) + 1);
    });

    await t("financial year rollover on 1 April through real issues", async () => {
      const a = await approved(), b = await approved(), c = await approved();
      assert.match(num(ok(await transitionDocument(mona, { id: a, transition: "issue", now: new Date("2028-03-31T10:00:00Z") }))), /^DOC\/2027-28\/0001$/);
      assert.match(num(ok(await transitionDocument(mona, { id: b, transition: "issue", now: new Date("2028-03-31T10:30:00Z") }))), /^DOC\/2027-28\/0002$/);
      assert.match(num(ok(await transitionDocument(mona, { id: c, transition: "issue", now: new Date("2028-03-31T19:00:00Z") }))), /^DOC\/2028-29\/0001$/);
    });

    await t("settings: per type numbering with its own prefix, pattern and series; permission and validation", async () => {
      const denied = await savePbSettings(ann, DEFAULT_SETTINGS);
      assert.equal(denied.ok, false);
      const badPattern = await savePbSettings(adam, { numbering: { default: { pattern: "{PREFIX}/{FY}" } } });
      assert.equal(badPattern.ok, false);
      assert.equal((await savePbSettings(adam, { numbering: { default: { prefix: "bad prefix" } } })).ok, false);
      assert.equal((await savePbSettings(adam, { numbering: { byType: { "not a type": { prefix: "X" } } } })).ok, false);
      const meta = ALL_META.find((m) => m.category === "hr")!;
      const s1 = await savePbSettings(adam, {
        numbering: { default: { pattern: "{PREFIX}/{FY}/{SEQ}", prefix: "ACME" }, byType: { [meta.id]: { prefix: "OFR", pattern: "{PREFIX}-{YYYY}-{SEQ:3}" } } },
      });
      assert.ok(s1.ok);
      const st = await getPbSettings();
      assert.equal(numberingFor(st, null).prefix, "ACME");
      assert.equal(numberingFor(st, meta.id).prefix, "OFR");
      assert.notEqual(numberingFor(st, meta.id).series, numberingFor(st, null).series, "an overridden type gets its own counter series");
      const typed = ok(await transitionDocument(mona, { id: await approved(meta.id), transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      assert.equal(num(typed), "OFR-2026-001");
      const typed2 = ok(await transitionDocument(mona, { id: await approved(meta.id), transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      assert.equal(num(typed2), "OFR-2026-002");
      const plain = ok(await transitionDocument(mona, { id: await approved(), transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      assert.match(num(plain), /^ACME\/2026-27\/\d{4}$/);
    });

    await t("the catalogue's suggested prefix is used for a type the company did not configure", async () => {
      await savePbSettings(adam, { numbering: { default: { prefix: "DOC" } } });
      const meta = ALL_META.find((m) => m.category === "it") ?? ALL_META[ALL_META.length - 1];
      const st = await getPbSettings();
      assert.equal(numberingFor(st, meta.id).prefix, meta.numberingPrefix);
      const r = ok(await transitionDocument(mona, { id: await approved(meta.id), transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      assert.ok(num(r).startsWith(`${meta.numberingPrefix}/2026-27/`));
    });

    await t("a number that would be too long is refused and goes back", async () => {
      await savePbSettings(adam, { numbering: { default: { pattern: "{PREFIX}/{PREFIX}/{PREFIX}/{PREFIX}/{SEQ}", prefix: "ABCDEFGHIJKLMNOP" } } });
      const id = await approved();
      bad(await transitionDocument(mona, { id, transition: "issue" }), "invalid");
      await savePbSettings(adam, { numbering: { default: { pattern: "{PREFIX}/{FY}/{SEQ}", prefix: "DOC" } } });
      const r = ok(await transitionDocument(mona, { id, transition: "issue" }));
      assert.match(num(r), /^DOC\/\d{4}-\d{2}\/\d{4}$/);
    });
  });

  await runAsCompany("co_m", async () => {
    await t("two companies number independently and keep their own settings", async () => {
      assert.equal((await getPbSettings()).numbering.default.prefix, "DOC");
      const r = ok(await transitionDocument(mona, { id: await approved(), transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      assert.equal(num(r), "DOC/2026-27/0001", "company M starts its own series at 1");
      assert.ok((await savePbSettings(adam, { numbering: { default: { prefix: "MM" } } })).ok);
    });
  });
  await runAsCompany("co_n", async () => {
    await t("company N is unaffected by company M's settings", async () => {
      assert.equal((await getPbSettings()).numbering.default.prefix, "DOC");
    });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log("test-pb-numbering: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
