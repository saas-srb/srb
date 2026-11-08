/**
 * The status page's incident record: reporting, updating, resolving, deleting, and the uptime figure worked out from it. Throwaway database.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/incidents_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-incidents.ts
 */
import assert from "node:assert/strict";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { createIncident, deleteIncident, listIncidents, updateIncident } from "@/lib/platform/status/incidents";
import { formatDuration, uptimePercent } from "@/lib/platform/status/shared";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const H = 3_600_000;

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  await check("uptime counts only outages and major problems, merges overlaps, clips to the window", () => {
    const now = Date.parse("2026-10-30T00:00:00Z");
    const iso = (ms: number) => new Date(ms).toISOString();
    assert.equal(uptimePercent([], 30, now), 100);
    // 43.2 minutes of a 30-day month is exactly 99.9%
    const m = 43.2 * 60_000;
    assert.equal(uptimePercent([{ impact: "outage", startedAt: iso(now - 5 * 86_400_000), resolvedAt: iso(now - 5 * 86_400_000 + m) }], 30, now), 99.9);
    assert.equal(uptimePercent([{ impact: "degraded", startedAt: iso(now - H), resolvedAt: iso(now) }, { impact: "maintenance", startedAt: iso(now - H), resolvedAt: iso(now) }], 30, now), 100, "slowness and planned work are not downtime");
    const a = { impact: "major" as const, startedAt: iso(now - 10 * H), resolvedAt: iso(now - 8 * H) };
    const b = { impact: "outage" as const, startedAt: iso(now - 9 * H), resolvedAt: iso(now - 7 * H) };
    assert.equal(uptimePercent([a, b], 1, now), Math.round((1 - 3 / 24) * 100_000) / 1000, "overlap is counted once (3 h of 24)");
    assert.equal(uptimePercent([{ impact: "outage", startedAt: iso(now - 40 * 86_400_000), resolvedAt: iso(now - 39 * 86_400_000) }], 30, now), 100, "outside the window");
    assert.equal(uptimePercent([{ impact: "outage", startedAt: iso(now - 12 * H), resolvedAt: null }], 1, now), 50, "an open outage counts up to now");
  });
  await check("durations read plainly", () => {
    assert.deepEqual([formatDuration(20 * 60_000), formatDuration(90 * 60_000), formatDuration(60 * H)], ["20 min", "1 h 30 min", "2 d 12 h"]);
  });

  let id = "";
  await check("an incident is reported, validated, and listed as open", async () => {
    assert.ok(!(await createIncident({ title: "", impact: "outage", components: [], message: "x" }, "u1")).ok);
    assert.ok(!(await createIncident({ title: "t", impact: "weird", components: [], message: "x" }, "u1")).ok);
    assert.ok(!(await createIncident({ title: "t", impact: "outage", components: [], message: "x", startedAt: new Date(Date.now() + 86_400_000).toISOString() }, "u1")).ok, "no future start");
    const r = await createIncident({ title: "Sign-in is slow", impact: "major", components: ["Sign-in", "Nonsense"], message: "We are looking into it.", startedAt: new Date(Date.now() - 2 * H).toISOString() }, "u1");
    assert.ok(r.ok);
    if (!r.ok) return;
    id = r.id;
    const list = await listIncidents();
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].status, list[0].components, list[0].updates.length], ["investigating", ["Sign-in"], 1]);
  });
  await check("updates are added, and resolving ends it (not before it began)", async () => {
    assert.ok((await updateIncident(id, { status: "identified", message: "A slow query." }, "u1")).ok);
    assert.ok(!(await updateIncident(id, { status: "resolved", message: "Fixed.", endedAt: new Date(Date.now() - 5 * H).toISOString() }, "u1")).ok, "end before start refused");
    assert.ok((await updateIncident(id, { status: "resolved", message: "Fixed.", endedAt: new Date(Date.now() - 1 * H).toISOString() }, "u1")).ok);
    const [i] = await listIncidents();
    assert.deepEqual([i.status, i.updates.length, i.resolvedAt !== null], ["resolved", 3, true]);
    const down = uptimePercent([i], 1);
    assert.ok(down < 100 && down > 90, `an hour of major problem in a day: ${down}`);
  });
  await check("reopening clears the end; deleting removes it from the record", async () => {
    assert.ok((await updateIncident(id, { status: "monitoring", message: "It is back." }, "u1")).ok);
    assert.equal((await listIncidents())[0].resolvedAt, null);
    assert.ok((await deleteIncident(id, "u1")).ok);
    assert.equal((await listIncidents()).length, 0);
  });

  console.log(`${passed} checks passed`);
  await (await clientPromise).db().dropDatabase();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
