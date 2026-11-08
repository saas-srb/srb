import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { PROMPT_BY_KEY } from "../src/lib/prompts/registry";
import { flushCounts, forgetPrompts, getPrompt, listPromptStatus, promptHistory, promptText, resetPrompt, restorePromptVersion, savePrompt, setPromptEnabled } from "../src/lib/prompts/store";

// Runs only against a throwaway database: set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const me = { id: "u1", email: "admin@example.com" };
const KEY = "support.draft";

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  const def = PROMPT_BY_KEY.get(KEY)!;
  const vars = Object.fromEntries(def.vars.map((v) => [v.name, v.example]));
  const required = def.vars.filter((v) => v.required).map((v) => `{{${v.name}}}`).join(" ");

  await t("nothing saved: the built-in text is used", async () => {
    assert.deepEqual(await promptText(KEY), { text: def.text, custom: false });
    assert.equal(await getPrompt(KEY, vars), (await getPrompt(KEY, vars)));
    await assert.rejects(() => promptText("nope.nope"), /Unknown prompt/);
  });
  await t("a bad text is refused and nothing changes", async () => {
    assert.equal((await savePrompt(KEY, "", "", me)).ok, false);
    assert.equal((await savePrompt(KEY, `${required} {{not_declared}}`, "", me)).ok, false);
    if (required) assert.equal((await savePrompt(KEY, "no variables here", "", me)).ok, false);
    assert.equal((await savePrompt("nope.nope", "x", "", me)).ok, false);
    assert.equal((await promptText(KEY)).custom, false);
  });
  await t("a saved text is used at once, with variables filled in", async () => {
    const r = await savePrompt(KEY, `CUSTOM ${required}`, "first", me);
    assert.deepEqual(r, { ok: true, version: 1 });
    const out = await getPrompt(KEY, vars);
    assert.ok(out.startsWith("CUSTOM "));
    assert.ok(!out.includes("{{"));
    assert.equal((await promptText(KEY)).custom, true);
  });
  await t("saving the same text again does not make a new version; a change does", async () => {
    assert.deepEqual(await savePrompt(KEY, `CUSTOM ${required}`, "", me), { ok: true, version: 1 });
    assert.deepEqual(await savePrompt(KEY, `CUSTOM TWO ${required}`, "second", me), { ok: true, version: 2 });
  });
  await t("switching it off brings the built-in text back; on brings the custom text back", async () => {
    await setPromptEnabled(KEY, false, me);
    assert.equal((await promptText(KEY)).custom, false);
    await setPromptEnabled(KEY, true, me);
    assert.ok((await promptText(KEY)).text.startsWith("CUSTOM TWO"));
    assert.equal((await setPromptEnabled("support.analyze", true, me)).ok, false, "nothing to switch");
  });
  await t("history lists every change, newest first, and any version can be restored", async () => {
    const h = await promptHistory(KEY);
    assert.deepEqual(h.map((x) => x.version), [4, 3, 2, 1].slice(0, h.length));
    assert.deepEqual(h.map((x) => x.action), ["enable", "disable", "save", "save"]);
    const first = h.find((x) => x.version === 1)!;
    assert.deepEqual(await restorePromptVersion(KEY, first._id, me), { ok: true, version: 5 });
    assert.ok((await promptText(KEY)).text.startsWith("CUSTOM ") && !(await promptText(KEY)).text.startsWith("CUSTOM TWO"));
    assert.equal((await restorePromptVersion(KEY, "missing", me)).ok, false);
    // a row written when it was switched off can be restored too
    const off = (await promptHistory(KEY)).find((x) => x.action === "disable")!;
    assert.deepEqual(await restorePromptVersion(KEY, off._id, me), { ok: true, version: 6 });
    assert.ok((await promptText(KEY)).text.startsWith("CUSTOM TWO"));
  });
  await t("a damaged override falls back to the built-in text", async () => {
    await db.collection("prompt_overrides").updateOne({ _id: KEY as never }, { $set: { text: "{{totally_unknown}}" } });
    forgetPrompts();
    assert.equal((await promptText(KEY)).custom, false);
    assert.ok((await getPrompt(KEY, vars)).length > 20);
    await savePrompt(KEY, `FIXED ${required}`, "", me); // v7
  });
  await t("reset is a new version, nothing is removed, numbering continues, and the earlier text can come back", async () => {
    const before = (await promptHistory(KEY)).length;
    assert.deepEqual(await resetPrompt(KEY, me), { ok: true, version: 8 });
    assert.equal((await promptText(KEY)).custom, false);
    assert.equal((await listPromptStatus())[KEY].state, "default");
    const h = await promptHistory(KEY);
    assert.equal(h.length, before + 1);
    assert.equal(h[0].action, "reset");
    assert.deepEqual(await resetPrompt(KEY, me), { ok: true, version: 8 }, "already built-in: no new version");
    const fixed = h.find((x) => x.text.startsWith("FIXED"))!;
    assert.deepEqual(await restorePromptVersion(KEY, fixed._id, me), { ok: true, version: 9 });
    assert.ok((await promptText(KEY)).text.startsWith("FIXED"));
    assert.equal((await listPromptStatus())[KEY].state, "custom");
    // restoring the built-in text (the reset row) is a reset again
    const resetRow = (await promptHistory(KEY)).find((x) => x.action === "reset")!;
    assert.deepEqual(await restorePromptVersion(KEY, resetRow._id, me), { ok: true, version: 10 });
    assert.equal((await promptText(KEY)).custom, false);
    assert.equal((await promptHistory(KEY)).length, before + 3, "every version is still there");
    assert.deepEqual((await savePrompt(KEY, def.text, "", me)), { ok: true, version: 10 }, "saving the built-in text when already built-in does nothing");
  });
  await t("uses are counted per prompt and per day", async () => {
    await flushCounts();
    await db.collection("prompt_stats").deleteMany({});
    for (let i = 0; i < 3; i++) await getPrompt(KEY, vars);
    await flushCounts();
    const s = (await listPromptStatus())[KEY];
    assert.ok(s.uses7d >= 3);
    assert.equal(Object.keys(await listPromptStatus()).length, [...PROMPT_BY_KEY].length);
  });
  await t("every change is in the audit log", async () => {
    const n = await db.collection("platform_audit_log").countDocuments({ action: { $regex: "^prompt\\." } });
    assert.ok(n >= 6, `only ${n}`);
  });

  await db.dropDatabase();
  console.log("prompt store tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
