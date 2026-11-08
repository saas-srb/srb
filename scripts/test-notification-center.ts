import assert from "node:assert/strict";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { listLog, listRules, planNotification, resetRule, updateRule } from "../src/lib/notify/center/store";
import { cancelAnnouncement, createAnnouncement, deleteAnnouncement, dispatchDue, listAnnouncements, updateAnnouncement } from "../src/lib/notify/center/announcements";
import { notify as prmsNotify, NOTIFICATIONS_COLLECTION } from "../src/lib/products/spendiq/notifications";
import { sendEmail } from "../src/lib/platform/email";
import { exampleValues, expandText, extractValues, planFromRule, DEFAULT_FOOTNOTE } from "../src/lib/notify/center/shared";

// Runs only against a throwaway database (never the dev database): set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  const A = "company-a", B = "company-b";
  let userA = "";

  await runAsCompany(A, async () => {
    const users = (await getDb()).collection("admin_users");
    userA = String((await users.insertOne({ email: "a@example.com", roles: ["super_admin"], status: "active" })).insertedId);
    await users.insertOne({ email: "a2@example.com", roles: ["hr"], status: "active" });
  });

  await t("the list is seeded per company, from the catalog, with locked account emails", async () => {
    const rules = await runAsCompany(A, listRules);
    assert.ok(rules.length > 100);
    assert.equal(rules.find((r) => r.key === "expense_approved")?.product, "prms");
    const reset = rules.find((r) => r.key === "auth_password_reset");
    assert.equal(reset?.locked, true); assert.equal(reset?.channels.inApp.unavailable, true);
  });

  await t("each event carries the wording found in the code, and remembers the last real notification", async () => {
    await runAsCompany(A, async () => {
      const before = (await listRules()).find((r) => r.key === "sop_overdue");
      assert.equal(before?.original?.title, "Overdue: acknowledge {sopCode}");
      assert.equal(before?.sample, null);
      await planNotification({ type: "sop_overdue", title: "Overdue: acknowledge SOP-014", body: "This was due 2026-10-01 (3 day(s) ago).", product: "sop" });
      await sleep(150);
      const after = (await listRules()).find((r) => r.key === "sop_overdue");
      assert.equal(after?.sample?.title, "Overdue: acknowledge SOP-014");
      assert.equal(after?.original?.title, "Overdue: acknowledge {sopCode}", "the code's wording is untouched by samples");
    });
  });

  await t("the product's own {name} values are recovered from the real text and can be reworded", async () => {
    assert.deepEqual(extractValues("Advance {advanceNumber} needs approval", "Advance ADV-5 needs approval"), { advanceNumber: "ADV-5" });
    assert.deepEqual(extractValues("{employeeName} · {amount}", "Ravi Kumar · ₹5,000.00"), { employeeName: "Ravi Kumar", amount: "₹5,000.00" });
    assert.equal(extractValues("Advance {advanceNumber} needs approval", "Something else entirely"), null);
    const channels = { inApp: { enabled: true, title: "Please approve {advanceNumber} ({amount})" }, push: { enabled: true }, email: { enabled: true } };
    const template = { title: "Advance {advanceNumber} needs approval", body: "{employeeName} · {amount}" };
    const plan = planFromRule({ locked: false, channels }, { title: "Advance ADV-5 needs approval", body: "Ravi · ₹5,000" }, { template });
    assert.equal(plan.inApp.title, "Please approve ADV-5 (₹5,000)");
    assert.equal(plan.push.title, "Advance ADV-5 needs approval", "unedited channels keep the original");
    // a value that can't be recovered never produces a half-filled message
    const odd = planFromRule({ locked: false, channels }, { title: "A completely different title", body: "x" }, { template });
    assert.equal(odd.inApp.title, "A completely different title");
    // previews mark what is not known yet
    assert.equal(planFromRule({ locked: false, channels }, { title: "Advance [advanceNumber] needs approval", body: null }, { template, mark: true }).inApp.title, "Please approve [advanceNumber] ([amount])");
  });

  await t("the preview fills the { } values with believable examples; {company} and the email extras resolve at send time", async () => {
    const values = exampleValues(["advanceNumber", "employeeName", "amount", "firstName", "approved/rejected"]);
    assert.equal(values.advanceNumber, "ADV-0001"); assert.equal(values.amount, "₹5,000.00"); assert.equal(values.employeeName, "Asha Verma");
    assert.equal(new Set(Object.values(values)).size, Object.keys(values).length, "examples are all different");
    const ctx = { values: { ...values, company: "Acme Care" }, company: "Acme Care" };
    assert.equal(expandText("Advance {advanceNumber} needs approval from {employeeName} · {amount}", ctx), "Advance ADV-0001 needs approval from Asha Verma · ₹5,000.00");
    assert.equal(expandText(DEFAULT_FOOTNOTE, { ...ctx, values: { ...ctx.values, settingsLink: "https://x.example/s" } }), "You get this because of your notification settings for Acme Care. Change which emails you get: https://x.example/s");
    // at send time {company} and {link} come from the event itself
    const plan = planFromRule({ locked: false, channels: { inApp: { enabled: true, title: "[{company}] {title}" }, push: { enabled: true }, email: { enabled: true } } }, { title: "Hello", body: null, company: "Acme Care" });
    assert.equal(plan.inApp.title, "[Acme Care] Hello");
  });

  await t("a channel turned off holds the bell back and says so in the log", async () => {
    await runAsCompany(A, async () => {
      assert.equal((await updateRule("expense_approved", { channels: { inApp: { enabled: false } } }, "u")).ok, true);
      await sleep(0);
    });
    // the rule cache is per process, 15 s: a fresh read through the store bust is immediate
    await runAsCompany(A, async () => {
      await prmsNotify({ recipientUserId: userA, audience: "staff", type: "expense_approved", title: "Approved", body: "Your expense was approved" });
      assert.equal(await (await getDb()).collection(NOTIFICATIONS_COLLECTION).countDocuments({ type: "expense_approved" }), 0);
      const log = await listLog({ channel: "inApp" });
      assert.equal(log.entries[0]?.status, "off");
    });
  });

  await t("turned back on, it is stored and logged as sent", async () => {
    await runAsCompany(A, async () => {
      await updateRule("expense_approved", { channels: { inApp: { enabled: true } } }, "u");
      await prmsNotify({ recipientUserId: userA, audience: "staff", type: "expense_approved", title: "Approved", body: "Your expense was approved" });
      assert.equal(await (await getDb()).collection(NOTIFICATIONS_COLLECTION).countDocuments({ type: "expense_approved" }), 1);
      assert.equal((await listLog({ channel: "inApp", status: "sent" })).entries.length, 1);
    });
  });

  await t("wording is templated per channel; reset restores the original", async () => {
    await runAsCompany(A, async () => {
      await updateRule("expense_approved", { channels: { push: { title: "[{{company}}] {{title}}", body: "{{body}} — thanks" } } }, "u");
      const plan = await planNotification({ type: "expense_approved", title: "Approved", body: "Paid soon" });
      assert.equal(plan.push.body, "Paid soon — thanks"); assert.equal(plan.inApp.title, "Approved");
      await resetRule("expense_approved", "u");
      assert.equal((await planNotification({ type: "expense_approved", title: "Approved", body: "Paid soon" })).push.body, "Paid soon");
    });
  });

  await t("account emails cannot be turned off; a normal one can, and the email is then skipped and logged", async () => {
    await runAsCompany(A, async () => {
      const r = await updateRule("auth_password_reset", { channels: { email: { enabled: false } } }, "u");
      assert.equal(r.ok, false);
      await updateRule("team_invitation", { channels: { email: { enabled: false } } }, "u");
      const res = await sendEmail({ to: "x@example.com", subject: "You're invited", html: "<p>x</p>", text: "x", event: "team_invitation" });
      assert.deepEqual(res, { ok: true, id: null });
      assert.equal((await listLog({ channel: "email", status: "off" })).entries.length, 1);
    });
  });

  await t("another company is not affected", async () => {
    await runAsCompany(B, async () => {
      assert.equal((await planNotification({ type: "team_invitation", title: "x" })).email.on, true);
      assert.equal((await listLog()).entries.length, 0);
      assert.ok((await listRules()).length > 100);
    });
  });

  await t("announcements: validation", async () => {
    await runAsCompany(A, async () => {
      const base = { title: "Closed Friday", body: "See you Monday", channels: { inApp: true }, audience: { type: "everyone" as const } };
      assert.equal((await createAnnouncement({ ...base, title: " ", when: "now" }, "u")).ok, false);
      assert.equal((await createAnnouncement({ ...base, channels: {}, when: "now" }, "u")).ok, false, "needs a channel");
      assert.equal((await createAnnouncement({ ...base, audience: { type: "roles", roles: [] }, when: "now" }, "u")).ok, false);
      assert.equal((await createAnnouncement({ ...base, when: "schedule", scheduledAt: new Date(Date.now() - 3600_000).toISOString() }, "u")).ok, false, "past time");
      assert.equal((await createAnnouncement({ ...base, when: "schedule", scheduledAt: null }, "u")).ok, false);
    });
  });

  await t("announcements: send now to a role goes through the pipeline and the log", async () => {
    await runAsCompany(A, async () => {
      const r = await createAnnouncement({ title: "Closed Friday", body: "See you Monday", channels: { inApp: true, push: false, email: false }, audience: { type: "roles", roles: ["hr"] }, when: "now" }, "u");
      assert.ok(r.ok && r.announcement.status === "sent" && r.announcement.recipients === 1);
      assert.equal(await (await getDb()).collection("panel_notifications").countDocuments({ type: "announcement" }), 1);
      assert.equal((await listLog({ channel: "inApp" })).entries.some((e) => e.event === "announcement"), true);
    });
  });

  await t("announcements: schedule, edit, cancel, and a due one is sent exactly once", async () => {
    await runAsCompany(A, async () => {
      const later = new Date(Date.now() + 3600_000).toISOString();
      const made = await createAnnouncement({ title: "Town hall", channels: { inApp: true }, audience: { type: "everyone" }, when: "schedule", scheduledAt: later }, "u");
      assert.ok(made.ok && made.announcement.status === "scheduled");
      if (!made.ok) return;
      const id = made.announcement.id;
      assert.equal(await dispatchDue(), 0, "not due yet");
      const edited = await updateAnnouncement(id, { title: "Town hall at 4", channels: { inApp: true }, audience: { type: "people", ids: [userA] }, when: "schedule", scheduledAt: later });
      assert.ok(edited.ok && edited.announcement.title === "Town hall at 4");
      assert.equal((await cancelAnnouncement(id)).ok, true);
      assert.equal((await cancelAnnouncement(id)).ok, false, "only scheduled ones cancel");
      assert.equal((await updateAnnouncement(id, { title: "x", channels: { inApp: true }, audience: { type: "everyone" }, when: "draft" })).ok, false, "cancelled can't be edited");

      const due = await createAnnouncement({ title: "Due now", channels: { inApp: true }, audience: { type: "people", ids: [userA] }, when: "schedule", scheduledAt: later }, "u");
      assert.ok(due.ok);
      if (!due.ok) return;
      await (await getDb()).collection("notification_announcements").updateOne({ _id: due.announcement.id as never }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });
      const [a, b] = await Promise.all([dispatchDue(), dispatchDue()]);
      assert.equal(a + b, 1, "two runs at once still send it once");
      assert.equal(await (await getDb()).collection("panel_notifications").countDocuments({ title: "Due now" }), 1);
      assert.equal((await listAnnouncements()).find((x) => x.id === due.announcement.id)?.status, "sent");
      assert.equal((await deleteAnnouncement(due.announcement.id)).ok, true);
    });
  });

  await t("another company sees none of it", async () => {
    await runAsCompany(B, async () => {
      assert.equal((await listAnnouncements()).length, 0);
    });
  });

  await db.dropDatabase();
  console.log("notification center tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
