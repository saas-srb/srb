/**
 * Documents without other products. ContractFlow comes with Playbook: write a document, send it to ContractFlow for an
 * employee or for a client typed by hand. Playbook alone: nothing can be sent. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { cfClones } from "@/lib/products/contractflow-ai/cf-db";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { createDocument } from "@/lib/products/playbook-ai/documents";
import { sendItemToContractFlow } from "@/lib/products/playbook-ai/handoff";
import { createManualParty, searchParties } from "@/lib/products/contractflow-ai/parties";
import { isLinkedFor } from "@/lib/products/contractflow-ai/party-types";
import { offerLetterRaw } from "./lib/pbdoc-fixtures";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  await listPlans();
  const now = new Date();
  const company = async (slug: string, products: string) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    ok((await setCompanyProducts(id, { products }, { id: "tester" })).ok, `${slug}: ${products}`);
    return id;
  };
  const actor = { id: new ObjectId().toHexString(), email: "d@docs.test", name: "Dee Director", roles: ["super_admin"], permissionOverrides: {} };
  const viewer = { userId: actor.id, email: actor.email, roles: ["super_admin"], overrides: {}, lpmsRoles: [], employeeId: null, sendForSignature: true } as never;

  // --- ContractFlow (with Playbook) ------------------------------------------------
  const contracts = await company("contracts", "lpms");
  await runAsCompany(contracts, async () => {
    const hidden = await unavailablePanelKeys(contracts);
    for (const p of ["/contractflow-ai", "/contractflow-ai/documents", "/playbook-ai", "/playbook-ai/documents/new", "/playbook-ai/documents/x/send", "/sign/token"]) ok(hrefAvailable(p, hidden), `${p} is open`);
    ok(!hrefAvailable("/talentos", hidden) && !hrefAvailable("/sprintos/clients", hidden), "the other products are not");

    ok(!isLinkedFor("client", hidden) && !isLinkedFor("vendor", hidden) && !isLinkedFor("candidate", hidden), "clients, vendors and candidates are typed by hand");
    ok(isLinkedFor("employee", hidden), "employees come from People & access");
    ok(isLinkedFor("client", new Set(["pms", "lms"])), "CashFlow keeps clients too");
    eq((await searchParties(viewer, { type: "client" })).length, 0, "nothing to pick yet");
    const made = await createManualParty(viewer, { type: "client", name: "Acme Retail", email: "asha@acme.example" });
    eq([made.displayName, made.linked], ["Acme Retail", false], "client added by hand");
    eq((await searchParties(viewer, { type: "client" })).map((h) => h.displayName), ["Acme Retail"], "and found again");

    const doc = await createDocument(actor, { title: "Service agreement", pbdoc: offerLetterRaw() });
    ok(doc.ok, `document written ${JSON.stringify(doc).slice(0, 200)}`);
    if (!doc.ok) return;
    const sent = await sendItemToContractFlow(actor, { documentId: doc.document._id, party: { type: "client", displayName: "Beta Traders", email: "b@beta.example" } });
    ok(sent.ok, `copied to ContractFlow ${JSON.stringify(sent).slice(0, 300)}`);
    const clones = await (await cfClones()).find({}).toArray();
    eq(clones.map((c) => [c.party.type, c.party.displayName]), [["client", "Beta Traders"]], "the draft waits in ContractFlow");
  });

  // --- Playbook alone --------------------------------------------------------------
  const books = await company("playbooks", "sop");
  await runAsCompany(books, async () => {
    const hidden = await unavailablePanelKeys(books);
    ok(hrefAvailable("/playbook-ai/documents", hidden) && !hrefAvailable("/contractflow-ai", hidden), "Playbook only");
    const doc = await createDocument(actor, { title: "Leave policy", pbdoc: offerLetterRaw() });
    ok(doc.ok, "writes documents");
    if (!doc.ok) return;
    const sent = await sendItemToContractFlow(actor, { documentId: doc.document._id, party: { type: "other", displayName: "Someone" } });
    ok(!sent.ok && /ContractFlow/.test((sent as { message: string }).message), "can't send for signature");
    eq(await (await cfClones()).countDocuments(), 0, "nothing was copied");
  });

  console.log(`documents standalone: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
    process.exit(process.exitCode ?? 0);
  });
