/** Settings → Domains: the guide and the domain list render in every situation (no domain, website domain, sign-in subdomain, .co.in). */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DomainsManager from "@/components/platform/DomainsManager";
import DomainsGuide from "@/components/platform/DomainsGuide";
import { toView } from "@/lib/platform/domains/custom";
import type { CompanyDomain } from "@/lib/platform/tenancy/companies";

(globalThis as { React?: unknown }).React = React;
let checks = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++; };

const now = new Date();
const doc = (host: string, extra: Partial<CompanyDomain> = {}): CompanyDomain => ({ _id: host, companyId: "c", status: "pending", verificationToken: "tok", isPrimary: false, kind: "custom", createdAt: now, verifiedAt: null, ...extra });
const actions = { add: async () => ({ ok: false as const, error: "" }), verify: async () => ({ ok: false as const, error: "" }), makePrimary: async () => ({ ok: false as const, error: "" }), remove: async () => ({ ok: false as const, error: "" }) };

const cases: [string, boolean, CompanyDomain[]][] = [
  ["no domain, two addresses", false, []],
  ["no domain, one address", true, []],
  ["website domain", false, [doc("www.acme.com", { status: "verified", verifiedAt: now, isPrimary: true })]],
  ["root .co.in domain", false, [doc("acme.co.in")]],
  ["sign-in subdomain beside our website", false, [doc("team.acme.com", { use: "app" })]],
  ["subdomain, one address", true, [doc("app.acme.co.in", { use: "app", status: "verified", verifiedAt: now })]],
  ["root domain, one address", true, [doc("acme.com", { use: "app" })]],
];
for (const [name, single, docs] of cases) {
  const views = docs.map((d) => toView(d, single));
  const html = renderToStaticMarkup(<DomainsGuide domains={views} single={single} />);
  ok(html.includes("How to connect your own domain") && !html.includes("undefined"), `guide: ${name}`);
  ok(renderToStaticMarkup(<DomainsManager initial={views} maxCustom={5} actions={actions} single={single} />).includes("Add a domain or subdomain"), `list: ${name}`);
}
const sub = renderToStaticMarkup(<DomainsGuide domains={[toView(doc("app.acme.co.in", { use: "app" }), true)]} single />);
ok(!sub.includes("already shows another website") && !sub.includes("app.app."), "a subdomain gets no website warning and no second app address");
console.log(`domains guide: ${checks} checks passed`);
process.exit(0);
