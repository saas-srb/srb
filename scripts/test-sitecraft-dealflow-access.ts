import { can as accessCan2 } from "../src/lib/access/can";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { CATALOGUE } from "../src/lib/access/catalogue";
import { microOf } from "../src/lib/access/micro";
import { can as cmsViewerCan } from "../src/lib/products/sitecraft-ai/viewer";
import { lmsCan } from "../src/lib/lms-auth";
import { growthAllowed } from "../src/lib/products/sitecraft-ai/growth";
import { isMeetingManager } from "../src/lib/dealflow-ai/meetings/access";
import { lmsCan as oldLmsCan, isLmsAdmin, hasLmsAccess } from "../src/lib/lms-roles";
import { cmsCan as oldCmsCan, hasCmsAccess } from "../src/lib/cms-roles";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const SC = "sitecraft-ai";
const DF = "dealflow-ai";
const P = SC;
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_ao", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[], ov: Record<string, boolean> | null = null) => ({ _id: new ObjectId(), email: roles.join("_") + (ov ? "_ov" : "") + "@x", roles, ...(ov ? { permissionOverrides: ov } : {}) });
    const people_ = { director: mk(["super_admin"]), cmsAdmin: mk(["cms_admin"]), cmsEditor: mk(["cms_editor"]), cmsViewer: mk(["cms_viewer"]), lmsAdmin: mk(["lms_admin"]), lmsManager: mk(["lms_manager"]), lmsAgent: mk(["lms_agent"]), agentOffers: mk(["lms_agent"], { "lms.canManageOffers": true }), both: mk(["cms_editor", "lms_agent"]), partial: mk(["employee"]), readOnly: mk(["employee"]) };
    await people.insertMany(Object.values(people_) as never);
    const subjectOf = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }) => subjectFromRow(row as never);
    const set = async (row: { _id: ObjectId }, product: string, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [product]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    await T("parity SiteCraft: old CMS roles give exactly the micro features their legacy capabilities give; the matrix round-trips with 0 differences", async () => {
      for (const [roles, ov] of [[["cms_viewer"], null], [["cms_editor"], null], [["cms_admin"], null], [["cms_viewer"], { "cms.canPublishPages": true }], [["cms_editor"], { "cms.canViewAudit": true }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(SC)) assert.equal(Boolean(access[SC]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
      }
    });
    await T("parity DealFlow: old CRM roles give exactly the micro features their legacy capabilities give; the matrix round-trips with 0 differences", async () => {
      for (const [roles, ov] of [[["lms_agent"], null], [["lms_manager"], null], [["lms_admin"], null], [["lms_agent"], { "lms.canManageOffers": true }], [["lms_manager"], { "lms.canExportData": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(DF)) assert.equal(Boolean(access[DF]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles}`); assert.deepEqual(d.withheld, [], `withheld ${roles}`);
      }
    });
    await T("old DealFlow checks: every old permission answers like the micro feature (employee, manager, admin)", async () => {
      const pairs: [string, Parameters<typeof oldLmsCan>[1]][] = [["leads.view", "VIEW_LEADS"], ["leads.create", "CREATE_LEADS"], ["leads.edit", "EDIT_LEADS"], ["messages.send", "MESSAGE_LEADS"], ["leads.delete", "DELETE_LEADS"], ["data.export", "EXPORT_DATA"], ["portal.impersonate", "IMPERSONATE"], ["careers.view", "VIEW_CAREERS"], ["careers.manage", "MANAGE_CAREERS"], ["campaigns.manage", "MANAGE_CAMPAIGNS"], ["campaigns.view", "VIEW_ANALYTICS"], ["chatbot.view", "VIEW_CHATBOT"], ["chatbot.manage", "MANAGE_CHATBOT"], ["offers.manage", "MANAGE_OFFERS"], ["wallet.manage", "MANAGE_WALLET"]];
      for (const row of [people_.lmsAgent, people_.lmsManager, people_.lmsAdmin, people_.agentOffers]) { const u = { subject: subjectOf(row) }; const ctx = { roles: row.roles, permissionOverrides: (row as { permissionOverrides?: Record<string, boolean> }).permissionOverrides ?? null }; for (const [m, p] of pairs) assert.equal(lmsCan(u, m), oldLmsCan(ctx as never, p), `${m} for ${row.email}`); }
    });
    await T("old SiteCraft checks: every old CMS permission answers like the micro feature (viewer, editor, admin)", async () => {
      const pairs: [string, Parameters<typeof oldCmsCan>[1]][] = [["pages.create", "PAGES_CREATE"], ["pages.edit", "PAGES_EDIT"], ["pages.delete", "PAGES_DELETE"], ["pages.publish", "PAGES_PUBLISH"], ["pages.restore", "PAGES_RESTORE"], ["sections.edit", "SECTIONS_EDIT"], ["navigation.manage", "NAV_MANAGE"], ["footer.manage", "FOOTER_MANAGE"], ["media.upload", "MEDIA_UPLOAD"], ["media.delete", "MEDIA_DELETE"], ["forms.manage", "FORMS_MANAGE"], ["theme.edit", "THEME_UPDATE"], ["theme.publish", "THEME_PUBLISH"], ["settings.manage", "SETTINGS_MANAGE"], ["activity.view", "VIEW_AUDIT"], ["collections.edit", "COLLECTIONS_EDIT"], ["collections.publish", "COLLECTIONS_PUBLISH"], ["pages.view", "VIEW"]];
      for (const row of [people_.cmsViewer, people_.cmsEditor, people_.cmsAdmin]) { const v = { subject: subjectOf(row) }; const ctx = { roles: row.roles, permissionOverrides: null }; for (const [m, p] of pairs) assert.equal(cmsViewerCan(v, m), oldCmsCan(ctx as never, p), `${m} for ${row.email}`); }
    });
    await T("shared Offers and Wallet: exactly the old two doors (CRM capability OR CMS permission) for every combination, with neither side granting the other", async () => {
      const old = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }, lmsPerm: "MANAGE_OFFERS" | "MANAGE_WALLET", cmsPerm: "PAGES_EDIT" | "SETTINGS_MANAGE") => { const ctx = { roles: row.roles, permissionOverrides: row.permissionOverrides ?? null } as never; return (hasLmsAccess(row.roles) && oldLmsCan(ctx, lmsPerm)) || (hasCmsAccess(row.roles) && oldCmsCan(ctx, cmsPerm)); };
      for (const row of Object.values(people_)) {
        if (row === people_.partial || row === people_.readOnly) continue;
        const subj = subjectOf(row);
        assert.equal(growthAllowed(subj, "offers"), old(row, "MANAGE_OFFERS", "PAGES_EDIT") || isLmsAdmin(row as never) || row.roles.includes("super_admin"), `offers for ${row.email}`);
        assert.equal(growthAllowed(subj, "wallet"), old(row, "MANAGE_WALLET", "SETTINGS_MANAGE") || isLmsAdmin(row as never) || row.roles.includes("super_admin"), `wallet for ${row.email}`);
      }
      assert.equal(growthAllowed(subjectOf(people_.cmsEditor), "offers"), true, "a CMS editor keeps offers");
      assert.equal(growthAllowed(subjectOf(people_.cmsEditor), "wallet"), false);
      assert.equal(growthAllowed(subjectOf(people_.lmsManager), "offers"), false, "a CRM manager never had offers");
      assert.equal(growthAllowed(subjectOf(people_.agentOffers), "offers"), true, "a CRM person with the capability keeps it");
      assert.equal(growthAllowed(subjectOf(people_.cmsViewer), "offers"), false);
    });
    await T("one-sided people neither lose nor gain anything after re-saving in People & access (CMS-only editor, CRM-only manager, CRM person with the offers capability, both)", async () => {
      for (const row of [people_.cmsEditor, people_.cmsAdmin, people_.lmsManager, people_.lmsAdmin, people_.agentOffers, people_.both]) {
        const before = subjectOf(row);
        const { access } = legacyToAccess({ roles: row.roles, permissionOverrides: (row as { permissionOverrides?: Record<string, boolean> }).permissionOverrides ?? null });
        const picked = splitPicked(access);
        const c = checkAccess(picked); assert.deepEqual(c.widened, [], row.email); assert.deepEqual(c.withheld, [], row.email);
        const after = { isDirector: false, access: c.access };
        for (const tool of ["offers", "wallet"] as const) assert.equal(growthAllowed(after, tool), growthAllowed(before, tool), `${tool} after re-save for ${row.email}`);
        for (const m of [...microOf(SC), ...microOf(DF)]) assert.equal(accessCan2(after, m.product, m.key, m.level), accessCan2(before, m.product, m.key, m.level), `${m.key} after re-save for ${row.email}`);
      }
      // a CMS-only editor is not given a CRM product by the re-save, and a CRM-only person is not given SiteCraft
      const cmsOnly = checkAccess(splitPicked(legacyToAccess({ roles: ["cms_editor"], permissionOverrides: null }).access));
      assert.equal(Object.keys(cmsOnly.access[DF] ?? {}).length, 0);
      const crmOnly = checkAccess(splitPicked(legacyToAccess({ roles: ["lms_manager"], permissionOverrides: null }).access));
      assert.equal(Object.keys(crmOnly.access[SC] ?? {}).length, 0);
    });
    await T("meetings: 'see and host every meeting' follows the old manager-and-admin rule", async () => {
      for (const row of [people_.lmsAgent, people_.lmsManager, people_.lmsAdmin, people_.director]) {
        const old = isLmsAdmin({ roles: row.roles, permissionOverrides: null } as never) || row.roles.includes("lms_manager");
        assert.equal(isMeetingManager({ id: "x", email: "x", roles: row.roles, permissionOverrides: {}, subject: subjectOf(row) }), old, row.email);
      }
    });
    await T("Read only is truly read only in SiteCraft and DealFlow, and a person with exactly it can look but not change anything", async () => {
      for (const product of [SC, DF]) {
        const pre = buildAccessUi().presets[product]; assert.equal(pre.readLabel, "Read only");
        await set(people_.readOnly, product, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
        const subj = subjectOf(((await people.findOne({ _id: people_.readOnly._id })) as never));
        for (const m of microOf(product)) if (m.level === "write") assert.equal(accessCan2(subj, product, m.key, "write"), false, `${m.key} must not come with Read only`);
      }
      assert.equal(growthAllowed(subjectOf(((await people.findOne({ _id: people_.readOnly._id })) as never)), "offers"), false);
    });
    await T("partial person and removal on the next request", async () => {
      await set(people_.partial, SC, { [`${SC}.pages.view`]: "read", [`${SC}.media.view`]: "read", [`${SC}.media.upload`]: "write" });
      let subj = subjectOf(((await people.findOne({ _id: people_.partial._id })) as never));
      assert.ok(cmsViewerCan({ subject: subj }, "media.upload") && cmsViewerCan({ subject: subj }, "pages.view"));
      for (const f of ["theme.publish", "pages.publish", "settings.manage", "offers.manage"]) assert.equal(cmsViewerCan({ subject: subj }, f), false, f);
      assert.equal(cmsViewerCan({ subject: subj }, "nonexistent.x"), false);
      await set(people_.partial, SC, { [`${SC}.pages.view`]: "read" });
      subj = subjectOf(((await people.findOne({ _id: people_.partial._id })) as never));
      assert.equal(cmsViewerCan({ subject: subj }, "media.upload"), false);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
