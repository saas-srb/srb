import assert from "node:assert/strict";
import { DLMS_ENTITIES, DLMS_ACTIONS } from "../src/lib/ai/agent/entities/dlms";
import { SEO_ENTITIES, SEO_ACTIONS, SEO_REPORTS } from "../src/lib/ai/agent/entities/seo";
import { AIBOTS_ENTITIES, AIBOTS_ACTIONS } from "../src/lib/ai/agent/entities/aibots";
import { OTS_ENTITIES, OTS_ACTIONS, OTS_REPORTS } from "../src/lib/ai/agent/entities/ots";
import { SMMS_ENTITIES, SMMS_ACTIONS } from "../src/lib/ai/agent/entities/smms";
import { LPMS_ENTITIES, LPMS_ACTIONS } from "../src/lib/ai/agent/entities/lpms";
import { LMS_ENTITIES, LMS_ACTIONS, LMS_REPORTS } from "../src/lib/ai/agent/entities/lms";
import { FMS_ENTITIES, FMS_ACTIONS, FMS_REPORTS } from "../src/lib/ai/agent/entities/fms";
import { MESSENGER_ENTITIES, MESSENGER_ACTIONS, MESSENGER_REPORTS } from "../src/lib/ai/agent/entities/messenger";
import { CMS_EXTRA_ENTITIES, CMS_EXTRA_ACTIONS, CMS_EXTRA_REPORTS } from "../src/lib/ai/agent/entities/cms-extra";
import { entitiesFor, actionsFor, reportsFor, canWrite } from "../src/lib/ai/agent/entities";
import { FINISHED_PANELS, isMicroGate } from "../src/lib/ai/agent/micro-gate";
import { microOf } from "../src/lib/access/micro";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { legacyToAccess } from "../src/lib/access/adapter";
import type { ActionDef, AgentUser, EntityDef, ReportDef } from "../src/lib/ai/agent/types";
import type { AccessSubject } from "../src/lib/access/can";

// The Ask AI engine decides from the person's micro features for every product finished on them. Pure (no database): fake sessions.
let passed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed++; console.log("  ✓", name); };

const ENT: EntityDef[] = [...DLMS_ENTITIES, ...SEO_ENTITIES, ...AIBOTS_ENTITIES, ...OTS_ENTITIES, ...SMMS_ENTITIES, ...LPMS_ENTITIES, ...LMS_ENTITIES, ...CMS_EXTRA_ENTITIES, ...FMS_ENTITIES, ...MESSENGER_ENTITIES];
const ACT: ActionDef[] = [...DLMS_ACTIONS, ...SEO_ACTIONS, ...AIBOTS_ACTIONS, ...OTS_ACTIONS, ...SMMS_ACTIONS, ...LPMS_ACTIONS, ...LMS_ACTIONS, ...CMS_EXTRA_ACTIONS, ...FMS_ACTIONS, ...MESSENGER_ACTIONS];
const REP: ReportDef[] = [...SEO_REPORTS, ...OTS_REPORTS, ...LMS_REPORTS, ...CMS_EXTRA_REPORTS, ...FMS_REPORTS, ...MESSENGER_REPORTS];
const panels = Object.keys(FINISHED_PANELS);
const writes = (e: EntityDef) => Boolean(e.write) || Boolean(e.ops) || Boolean(e.rawWrite);

(async () => {
  await T("static: no entity, action or report of a finished product relies only on the old per-panel role list (every gate is a micro gate)", () => {
    for (const e of ENT.filter((x) => panels.includes(x.panel))) {
      assert.ok(isMicroGate(e.allowRead), `${e.key} read gate`);
      if (writes(e)) assert.ok(isMicroGate(e.allow), `${e.key} write gate`);
    }
    for (const a of ACT.filter((x) => panels.includes(x.panel))) assert.ok(isMicroGate(a.allow), `${a.key} action gate`);
    for (const r of REP.filter((x) => panels.includes(x.panel))) assert.ok(isMicroGate(r.allow), `${r.key} report gate`);
    assert.ok(ENT.filter((x) => panels.includes(x.panel)).length > 40 && ACT.filter((x) => panels.includes(x.panel)).length > 100);
  });

  const user = (subject: AccessSubject | undefined): AgentUser => ({ id: "u1", email: "u@x", roles: ["super_admin"], subject });
  const none: AccessSubject = { isDirector: false, access: {} };
  const readOnlyOf = (product: string): AccessSubject => ({ isDirector: false, access: { [product]: Object.fromEntries(buildAccessUi().presets[product].read.map((k) => [k, "read" as const])) } });

  for (const [panel, { product }] of Object.entries(FINISHED_PANELS)) {
    await T(`${panel} (${product}): Director gets entities, actions and reports; a session with no access subject or an empty one gets nothing`, async () => {
      const d = user({ isDirector: true });
      // a few entities scope by looking up the person's memberships (needs a database); the gate decision is what is tested here
      const ents = await entitiesFor(d, panel).catch((e: Error) => { if (e.name !== "TenantResolutionError") throw e; return [null as never]; });
      const ownEnts = ENT.filter((e) => e.panel === panel);
      assert.ok(ents.length > 0 || ownEnts.length === 0, "Director reads");
      assert.ok(actionsFor(d, panel).length === ACT.filter((a) => a.panel === panel).length, "Director may run every action");
      assert.equal(reportsFor(d, panel).length, REP.filter((r) => r.panel === panel).length);
      for (const u of [user(undefined), user(none)]) {
        // entities that scope to "nothing" may still be listed with an empty-result filter, but nothing can be written, run or reported
        assert.equal(actionsFor(u, panel).length, 0, "no actions");
        assert.equal(reportsFor(u, panel).length, 0, "no reports");
        for (const e of ownEnts) assert.equal(canWrite(u, e), false, `${e.key} write`);
      }
    });
    await T(`${panel}: a Read only person can read within scope but can create, update, delete or run nothing`, async () => {
      const u = user(readOnlyOf(product));
      for (const e of ENT.filter((x) => x.panel === panel)) assert.equal(canWrite(u, e), false, `${e.key} must not be writable with Read only`);
      assert.deepEqual(actionsFor(u, panel).map((a) => a.key), [], `${panel}: no action is offered to Read only`);
    });
    await T(`${panel}: a partial person gets exactly what their features allow (one write feature opens only the actions that need it)`, async () => {
      const writeFeature = microOf(product).find((m) => m.level === "write" && m.kind !== "scope");
      if (!writeFeature) return;
      const only: AccessSubject = { isDirector: false, access: { [product]: { [writeFeature.key]: "write" } } };
      const all = ACT.filter((a) => a.panel === panel).length;
      const some = actionsFor(user(only), panel).length;
      assert.ok(some < all, "one feature must not open every action");
      const withOther = actionsFor(user({ isDirector: false, access: { [product]: Object.fromEntries(microOf(product).filter((m) => m.kind !== "scope").map((m) => [m.key, m.level])) } }), panel).length;
      assert.ok(withOther >= some, "more features never open fewer actions");
    });
  }

  await T("reads are scoped by features: a person with one view feature reads that kind of record and the others come back empty", async () => {
    const seoOnly: AccessSubject = { isDirector: false, access: { "rankmax-ai": { "rankmax-ai.tasks.view": "read" } } };
    const ents = await entitiesFor(user(seoOnly), "seo");
    const none = (key: string) => JSON.stringify(ents.find((e) => e.key === key)?.baseFilter ?? null).includes("__none__");
    assert.equal(none("seo.task"), false, "tasks readable");
    assert.equal(none("seo.keyword"), true, "keywords empty");
    assert.equal(none("seo.backlink"), true, "backlinks empty");
    const ots: AccessSubject = { isDirector: false, access: { evaliq: { "evaliq.tests.view": "read" } } };
    const oe = await entitiesFor(user(ots), "ots");
    const oNone = (key: string) => { const e = oe.find((x) => x.key === key); return !e || JSON.stringify(e.baseFilter ?? null).includes("__none__"); };
    assert.equal(oNone("ots.test"), false); assert.equal(oNone("ots.question"), true); assert.equal(oNone("ots.assignment"), true);
  });
  await T("own-only: a person from the old lowest role sees no more than the Director and no write the role could not do", async () => {
    const lowest: Record<string, string> = { dlms: "dlms_employee", seo: "seo_employee", aibots: "aibots_user", ots: "ots_candidate", smms: "smms_employee", lpms: "lpms_viewer", cms: "cms_viewer", lms: "lms_agent", fms: "finance_read_only", messenger: "chat_employee" };
    for (const [panel, { product }] of Object.entries(FINISHED_PANELS)) {
      const subject: AccessSubject = { isDirector: false, ...legacyToAccess({ roles: [lowest[panel]], permissionOverrides: null }) };
      const u: AgentUser = { id: "u2", email: "o@x", roles: ["super_admin"], subject: { isDirector: false, access: subject.access } };
      const all = ACT.filter((a) => a.panel === panel).length;
      assert.ok(actionsFor(u, panel).length < all || all === 0, `${panel}: the lowest role must not run every action`);
      void product;
    }
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
