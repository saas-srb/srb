import assert from "node:assert/strict";
import { describeCron, firesAt, intervalMs, isValidCron, nextRun, previousRun } from "../src/lib/cron/schedule";

// Pure: no database. Run with: npx tsx scripts/test-cron-schedule.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const at = (s: string) => new Date(s);

t("daily at a fixed time", () => {
  assert.equal(nextRun("30 2 * * *", at("2026-10-25T02:29:30Z"))?.toISOString(), "2026-10-25T02:30:00.000Z");
  assert.equal(nextRun("30 2 * * *", at("2026-10-25T02:30:00Z"))?.toISOString(), "2026-10-26T02:30:00.000Z", "strictly after");
  assert.equal(previousRun("30 2 * * *", at("2026-10-25T09:00:00Z"))?.toISOString(), "2026-10-25T02:30:00.000Z");
  assert.equal(previousRun("30 2 * * *", at("2026-10-25T02:30:45Z"))?.toISOString(), "2026-10-25T02:30:00.000Z", "at or before");
});
t("steps, lists and ranges", () => {
  assert.equal(nextRun("*/5 * * * *", at("2026-10-25T10:03:10Z"))?.toISOString(), "2026-10-25T10:05:00.000Z");
  assert.equal(intervalMs("*/5 * * * *"), 300_000);
  assert.equal(nextRun("0 6,18 * * *", at("2026-10-25T07:00:00Z"))?.toISOString(), "2026-10-25T18:00:00.000Z");
  assert.equal(nextRun("0 9 * * 1-5", at("2026-10-24T10:00:00Z"))?.toISOString(), "2026-10-26T09:00:00.000Z", "Saturday → Monday");
  assert.equal(firesAt("10-50/20 * * * *", at("2026-10-25T10:30:59Z")), true);
  assert.equal(firesAt("10-50/20 * * * *", at("2026-10-25T10:20:00Z")), false);
});
t("day fields: either one matches when both are set; Sunday is 0 or 7", () => {
  assert.equal(firesAt("0 0 13 * 5", at("2026-11-13T00:00:00Z")), true);
  assert.equal(firesAt("0 0 13 * 5", at("2026-11-20T00:00:00Z")), true, "a Friday that is not the 13th");
  assert.equal(firesAt("0 0 * * 7", at("2026-10-25T00:00:00Z")), true, "2026-10-25 is a Sunday");
});
t("bad expressions are refused", () => {
  for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "*/0 * * * *", "a b c d e", "5-1 * * * *"]) assert.equal(isValidCron(bad), false, bad);
});
t("plain-language readings", () => {
  assert.equal(describeCron("30 2 * * *"), "Every day at 02:30 UTC");
  assert.equal(describeCron("*/5 * * * *"), "Every 5 minutes");
  assert.equal(describeCron("0 * * * *"), "Every hour");
  assert.equal(describeCron("0 9 * * 1"), "0 9 * * 1 (UTC)");
});
console.log("cron schedule tests passed");
