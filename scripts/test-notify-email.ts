/**
 * The notification EMAIL channel's rules and the preferences that drive it (pure: no database, no mail sent).
 *   npx tsx scripts/test-notify-email.ts
 */
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, PUSH_CATEGORIES, normalizePreferences } from "../src/lib/push/categories";
import { dayKey, emailCaps, emailSubject, hourKey, safeEmailPath, wantsEmail } from "../src/lib/notify/email-channel-rule";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("no saved choice = the defaults: attention things by email, chat and AI not", () => {
  const p = normalizePreferences(undefined);
  for (const c of ["business", "reminders", "alerts", "workflow", "system"] as const) assert.equal(wantsEmail(p, c), true, c);
  for (const c of ["ai", "messages"] as const) assert.equal(wantsEmail(p, c), false, c);
});
t("preferences saved before email existed gain the email defaults", () => {
  const old = { enabled: true, categories: { business: false }, quietHours: { enabled: false } };
  const p = normalizePreferences(old);
  assert.deepEqual(p.email, DEFAULT_PREFERENCES.email);
  assert.equal(p.categories.business, false); // their push choice is untouched
});
t("master switch off beats every category", () => {
  const p = normalizePreferences({ email: { enabled: false, categories: { alerts: true, business: true } } });
  for (const c of PUSH_CATEGORIES) assert.equal(wantsEmail(p, c), false, c);
});
t("a category can be turned off or (for chat) on", () => {
  const p = normalizePreferences({ email: { enabled: true, categories: { business: false, messages: true } } });
  assert.equal(wantsEmail(p, "business"), false);
  assert.equal(wantsEmail(p, "messages"), true);
  assert.equal(wantsEmail(p, "alerts"), true);
});
t("junk in the saved email section is ignored", () => {
  const p = normalizePreferences({ email: { enabled: "yes", categories: { business: "no", alerts: null, bogus: true } } });
  assert.deepEqual(p.email, DEFAULT_PREFERENCES.email);
  assert.equal("bogus" in p.email.categories, false);
});
t("push choices do not leak into email choices", () => {
  const p = normalizePreferences({ enabled: false, categories: { alerts: false } });
  assert.equal(wantsEmail(p, "alerts"), true);
});
t("alerts get bigger caps than the rest", () => {
  assert.ok(emailCaps("alerts").perHour > emailCaps("business").perHour);
  assert.ok(emailCaps("alerts").perDay > emailCaps("business").perDay);
});
t("counters roll over each hour and each day (UTC)", () => {
  assert.equal(hourKey(new Date("2026-10-25T07:59:59Z")), "2026102507");
  assert.equal(hourKey(new Date("2026-10-25T08:00:00Z")), "2026102508");
  assert.equal(dayKey(new Date("2026-10-25T23:59:59Z")), "20261025");
  assert.equal(dayKey(new Date("2026-10-26T00:00:00Z")), "20261026");
});
t("subject: one line, branded, bounded", () => {
  assert.equal(emailSubject("Acme", "Leave approved"), "[Acme] Leave approved");
  assert.equal(emailSubject("Acme", "Two\nlines\r\nhere"), "[Acme] Two lines here");
  assert.equal(emailSubject("", "Only title"), "Only title");
  { const long = emailSubject("A", "x".repeat(400)); assert.ok(long.length <= 150 && long.endsWith("…")); }
  assert.equal(emailSubject("", ""), "Notification");
});
t("links in emails stay on the site", () => {
  assert.equal(safeEmailPath("/talentos/leave/1", "/home"), "/talentos/leave/1");
  for (const bad of ["https://evil.test/x", "//evil.test", "/a\\b", "javascript:alert(1)", "/ok\nSet-Cookie: x", null, undefined, ""]) assert.equal(safeEmailPath(bad as string, "/home"), "/home", String(bad));
});
console.log(`${passed} passed`);
