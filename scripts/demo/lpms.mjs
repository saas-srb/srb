// Legal & Documents (LPMS) demo data: logins, categories, document types, templates, an approval workflow and ~12 documents
// covering every lifecycle state (draft → review → pending approval → approved → published → archived), version history,
// approvals, signature requests and an audit trail. Idempotent: everything it creates has a `demo-lpms-` id.
import { ObjectId } from "mongodb";
import { hashPassword, ago, fromNow, rint } from "./lib.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-lpms-";

export const LPMS_DEMO_ACCOUNTS = [
  { email: "demo.lpms.admin@example.com", label: "Legal Admin", roles: ["lpms_admin"] },
  { email: "demo.lpms.manager@example.com", label: "Legal Manager", roles: ["lpms_manager"] },
  { email: "demo.lpms.author@example.com", label: "Legal Author", roles: ["lpms_author"] },
  { email: "demo.lpms.viewer@example.com", label: "Legal Viewer", roles: ["lpms_viewer"] },
];

let n = 0;
const bid = () => `${D}b${++n}`;
const h = (content, level = 2) => ({ id: bid(), type: "heading", content, level });
const p = (content) => ({ id: bid(), type: "paragraph", content });
const bullets = (items) => ({ id: bid(), type: "bullets", items });
const numbered = (items) => ({ id: bid(), type: "numbered", items });
const v = (key, label, fallback = "") => ({ id: bid(), type: "variable", key, label, fallback });
const sign = (label, signerRole) => ({ id: bid(), type: "signature", label, signerRole, required: true });

const TYPES = [
  { slug: "employment-agreement", name: "Employment Agreement", category: "HR & Employment", icon: "file-text", color: "#4338ca", description: "Offer-stage contract between the company and a new employee." },
  { slug: "nda", name: "Non-Disclosure Agreement", category: "Contracts", icon: "shield", color: "#0f766e", description: "Mutual or one-way confidentiality agreement with a counterparty." },
  { slug: "service-agreement", name: "Service Agreement", category: "Contracts", icon: "handshake", color: "#b45309", description: "Master terms for services delivered to a client." },
  { slug: "privacy-policy", name: "Privacy Policy", category: "Policies", icon: "lock", color: "#be123c", description: "How the company collects, uses and protects personal data." },
  { slug: "internal-policy", name: "Internal Policy", category: "Policies", icon: "book", color: "#475569", description: "Company-wide rules such as leave, travel and acceptable use." },
];

const field = (key, label, type = "text", extra = {}) => ({ key, label, type, required: true, ...extra });
const FIELDS = {
  "employment-agreement": [field("employeeName", "Employee name"), field("designation", "Designation"), field("startDate", "Start date", "date"), field("annualCtc", "Annual CTC", "number")],
  nda: [field("partyName", "Counterparty"), field("effectiveDate", "Effective date", "date"), field("termMonths", "Term (months)", "number")],
  "service-agreement": [field("clientName", "Client"), field("scope", "Scope of services", "textarea"), field("monthlyFee", "Monthly fee", "number")],
  "privacy-policy": [field("contactEmail", "Privacy contact email")],
  "internal-policy": [field("policyOwner", "Policy owner"), field("reviewCycle", "Review cycle", "select", { options: ["Quarterly", "Half-yearly", "Yearly"] })],
};

const BODY = {
  "employment-agreement": [
    h("Employment Agreement", 1),
    p("This Agreement is made between the Company and {{employeeName}}, who will join as {{designation}} on {{startDate}}."),
    h("1. Compensation"), p("The employee will receive an annual cost to company of INR {{annualCtc}}, paid monthly after statutory deductions."),
    h("2. Probation and notice"), p("The first six months are a probation period. Either party may end the employment with 30 days written notice after confirmation."),
    h("3. Confidentiality"), p("The employee will keep all non-public business information confidential during and after employment."),
    sign("Employee", "employee"), sign("Authorised signatory", "company"),
  ],
  nda: [
    h("Non-Disclosure Agreement", 1),
    p("This Agreement is effective from {{effectiveDate}} between the Company and {{partyName}}."),
    h("1. Confidential information"), bullets(["Business plans, pricing and financial data", "Customer and supplier lists", "Source code, designs and technical documentation"]),
    h("2. Obligations"), numbered(["Use the information only for the agreed purpose", "Do not disclose it to third parties without written consent", "Return or destroy it on request"]),
    h("3. Term"), p("The obligations continue for {{termMonths}} months from the effective date."),
    sign("Disclosing party", "company"), sign("Receiving party", "counterparty"),
  ],
  "service-agreement": [
    h("Service Agreement", 1),
    p("This Agreement is between the Company (the provider) and {{clientName}} (the client)."),
    h("1. Services"), p("{{scope}}"),
    h("2. Fees and payment"), p("The client will pay INR {{monthlyFee}} per month, invoiced in advance, due within 15 days of the invoice date."),
    h("3. Liability"), p("Liability of either party is limited to the fees paid in the preceding three months, except for wilful misconduct."),
    sign("Provider", "company"), sign("Client", "client"),
  ],
  "privacy-policy": [
    h("Privacy Policy", 1),
    p("We collect only the personal data needed to deliver our services: account details, usage data and support conversations."),
    h("How we use data"), bullets(["To provide and secure the service", "To send service notices", "To improve the product"]),
    h("Your rights"), p("You can ask us to access, correct or delete your data at {{contactEmail}}. We respond within 30 days."),
  ],
  "internal-policy": [
    h("Internal Policy", 1),
    p("This policy is owned by {{policyOwner}} and reviewed {{reviewCycle}}."),
    h("Scope"), p("It applies to every employee, contractor and intern of the company."),
    h("Principles"), numbered(["Follow the law and company values", "Protect company assets and data", "Report concerns early"]),
  ],
};

const DOCS = [
  ["employment-agreement", "Employment Agreement — Ananya Sharma", "published", { employeeName: "Ananya Sharma", designation: "Senior Engineer", startDate: "2026-02-01", annualCtc: 1800000 }, "HR", 120],
  ["employment-agreement", "Employment Agreement — Rohan Mehta", "approved", { employeeName: "Rohan Mehta", designation: "Account Manager", startDate: "2026-11-01", annualCtc: 1200000 }, "HR", 9],
  ["employment-agreement", "Employment Agreement — Priya Nair", "pending_approval", { employeeName: "Priya Nair", designation: "Product Designer", startDate: "2026-11-15", annualCtc: 1500000 }, "HR", 4],
  ["nda", "NDA — Nimbus Cloud", "published", { partyName: "Nimbus Cloud Pvt Ltd", effectiveDate: "2026-06-10", termMonths: 36 }, "Legal", 95],
  ["nda", "NDA — Orbital Logistics", "review", { partyName: "Orbital Logistics Ltd", effectiveDate: "2026-10-20", termMonths: 24 }, "Legal", 6],
  ["nda", "NDA — Bluepeak Finance", "draft", { partyName: "Bluepeak Finance", effectiveDate: "2026-11-05", termMonths: 12 }, "Legal", 2],
  ["service-agreement", "Service Agreement — Quantum Retail", "active", { clientName: "Quantum Retail", scope: "Managed website, monthly reporting and 24x7 support.", monthlyFee: 250000 }, "Sales", 150],
  ["service-agreement", "Service Agreement — Zenith Health", "pending_approval", { clientName: "Zenith Health", scope: "Custom CRM implementation and staff training.", monthlyFee: 420000 }, "Sales", 5],
  ["service-agreement", "Service Agreement — Atlas Realty (2024)", "archived", { clientName: "Atlas Realty", scope: "Lead management setup.", monthlyFee: 90000 }, "Sales", 400],
  ["privacy-policy", "Privacy Policy v3", "published", { contactEmail: "privacy@example.com" }, "Legal", 60],
  ["internal-policy", "Leave and Attendance Policy", "published", { policyOwner: "Head of HR", reviewCycle: "Yearly" }, "HR", 200],
  ["internal-policy", "Acceptable Use Policy", "review", { policyOwner: "Head of IT", reviewCycle: "Half-yearly" }, "IT", 11],
];

export async function seedLpms(db) {
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);

  for (const c of ["lpms_maker_types", "lpms_templates", "lpms_documents", "lpms_document_versions", "lpms_workflows", "lpms_approvals", "lpms_signatures", "lpms_categories", "lpms_audit"]) {
    await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });
  }

  // ---- logins
  const users = {};
  for (const a of LPMS_DEMO_ACCOUNTS) {
    const existing = await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } });
    const _id = existing?._id ?? new ObjectId();
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { passwordHash, roles: a.roles, permissionOverrides: {}, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now }, $setOnInsert: { _id, email: a.email, name: a.label, userType: "system", employeeId: null, createdAt: now, lastLoginAt: null } },
      { upsert: true },
    );
    users[a.email] = { id: String(existing?._id ?? _id), email: a.email, name: a.label };
  }
  const admin = users["demo.lpms.admin@example.com"];
  const manager = users["demo.lpms.manager@example.com"];
  const author = users["demo.lpms.author@example.com"];

  // ---- categories
  const cats = [...new Set(TYPES.map((t) => t.category))];
  await db.collection("lpms_categories").insertMany(cats.map((name, i) => ({
    _id: `${D}cat-${i}`, name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-"), color: TYPES.find((t) => t.category === name).color, icon: "folder", description: `${name} documents`,
    parentId: null, makerTypeIds: TYPES.filter((t) => t.category === name).map((t) => `${D}type-${t.slug}`), isArchived: false, order: i, createdAt: ago(300),
  })));

  // ---- approval workflow
  const wfId = `${D}wf-standard`;
  await db.collection("lpms_workflows").insertOne({
    _id: wfId, name: "Legal review and approval", description: "Author → legal manager review → admin sign-off", isDefault: true, createdAt: ago(300), updatedAt: ago(300),
    steps: [
      { id: `${D}s1`, order: 1, label: "Legal review", requiredRoles: ["lpms_manager"], conditions: [], notifyRoles: ["lpms_author"], escalateAfterDays: 3 },
      { id: `${D}s2`, order: 2, label: "Final approval", requiredRoles: ["lpms_admin"], conditions: [], notifyRoles: ["lpms_manager"], escalateAfterDays: 5 },
    ],
  });

  // ---- document types + templates
  const typeId = (slug) => `${D}type-${slug}`;
  const tplId = (slug) => `${D}tpl-${slug}`;
  await db.collection("lpms_maker_types").insertMany(TYPES.map((t, i) => ({
    _id: typeId(t.slug), name: t.name, slug: t.slug, description: t.description, category: t.category, icon: t.icon, color: t.color,
    fieldsSchema: FIELDS[t.slug], defaultDataSources: ["workspace", "hrms"], workflowId: wfId, outputFormats: ["pdf", "docx", "print"],
    brandingConfig: { useLogo: true, useColors: true, useHeader: true, useFooter: true, headerText: "", footerText: "Confidential" },
    permissions: { create: ["lpms_author", "lpms_manager", "lpms_admin"], edit: ["lpms_author", "lpms_manager", "lpms_admin"], approve: ["lpms_manager", "lpms_admin"], publish: ["lpms_manager", "lpms_admin"], archive: ["lpms_admin"] },
    numbering: { prefix: t.slug.split("-").map((w) => w[0]).join("").toUpperCase(), separator: "-", startFrom: 1, paddingLength: 4, includeYear: true, includeMonth: false },
    isArchived: false, createdAt: ago(320 - i), updatedAt: ago(320 - i), createdBy: admin.id,
  })));
  await db.collection("lpms_templates").insertMany(TYPES.map((t, i) => ({
    _id: tplId(t.slug), makerTypeId: typeId(t.slug), name: `${t.name} — standard`, description: `Company standard ${t.name.toLowerCase()}`, isDefault: true,
    blocks: BODY[t.slug], headerBlocks: [], footerBlocks: [], variables: FIELDS[t.slug].map((f) => f.key), tags: [t.category.toLowerCase()], version: 1,
    isArchived: false, createdAt: ago(300 - i), updatedAt: ago(300 - i), createdBy: admin.id,
  })));

  // ---- documents, versions, approvals, signatures, audit
  const docs = [], versions = [], approvals = [], signatures = [], auditRows = [];
  const counters = {};
  DOCS.forEach(([slug, title, status, values, department, age], i) => {
    const _id = `${D}doc-${i + 1}`;
    const seq = (counters[slug] = (counters[slug] ?? 0) + 1);
    const type = TYPES.find((t) => t.slug === slug);
    const prefix = type.slug.split("-").map((w) => w[0]).join("").toUpperCase();
    const created = ago(age + 3), updated = ago(age);
    const resolved = Object.fromEntries(Object.entries(values).map(([k, val]) => [k, String(val)]));
    const published = ["published", "active", "archived"].includes(status);
    const approved = published || status === "approved";
    const maker = i % 2 ? author : manager;
    const versionCount = published ? 3 : status === "draft" ? 1 : 2;
    docs.push({
      _id, makerTypeId: typeId(slug), templateId: tplId(slug), documentNumber: `${prefix}-2026-${String(seq).padStart(4, "0")}`, title, status,
      blocks: BODY[slug], headerBlocks: [], footerBlocks: [], resolvedVariables: resolved, selectedEntities: {}, fieldValues: values, currentVersion: versionCount,
      workflowId: wfId, currentWorkflowStep: status === "review" ? `${D}s1` : status === "pending_approval" ? `${D}s2` : null, signatures: [],
      tags: [type.category.toLowerCase()], category: type.category, department, owner: maker.email, collaborators: [author.email],
      effectiveDate: published ? created : null, expiryDate: slug === "service-agreement" || slug === "nda" ? fromNow(rint(90, 700)) : null,
      isAiGenerated: i % 5 === 0, aiPrompt: i % 5 === 0 ? `Draft a ${type.name.toLowerCase()} for our standard terms` : null, outputFormat: published ? "pdf" : null,
      createdAt: created, updatedAt: updated, createdBy: maker.id, updatedBy: maker.id,
      publishedAt: published ? updated : null, publishedBy: published ? manager.id : null, approvedAt: approved ? ago(age + 1) : null, approvedBy: approved ? admin.id : null,
    });
    for (let ver = 1; ver <= versionCount; ver++) {
      versions.push({
        _id: `${D}ver-${i + 1}-${ver}`, documentId: _id, versionNumber: ver, blocks: BODY[slug], headerBlocks: [], footerBlocks: [], resolvedVariables: resolved, fieldValues: values, selectedEntities: {},
        status: ver === versionCount ? status : "draft", changeNote: ver === 1 ? "Initial draft" : ver === 2 ? "Legal review comments applied" : "Final wording agreed", createdAt: ago(age + versionCount - ver), createdBy: maker.id,
      });
    }
    if (["review", "pending_approval", "approved", "published", "active", "archived"].includes(status)) {
      approvals.push({ _id: `${D}apr-${i + 1}-1`, documentId: _id, workflowStepId: `${D}s1`, stepLabel: "Legal review", status: status === "review" ? "pending" : "approved", requestedBy: maker.id, assignedTo: [manager.id], decidedBy: status === "review" ? null : manager.id, decision: status === "review" ? null : "approved", notes: status === "review" ? null : "Wording is fine.", requestedAt: ago(age + 2), decidedAt: status === "review" ? null : ago(age + 1) });
    }
    if (["pending_approval", "approved", "published", "active", "archived"].includes(status)) {
      approvals.push({ _id: `${D}apr-${i + 1}-2`, documentId: _id, workflowStepId: `${D}s2`, stepLabel: "Final approval", status: status === "pending_approval" ? "pending" : "approved", requestedBy: manager.id, assignedTo: [admin.id], decidedBy: status === "pending_approval" ? null : admin.id, decision: status === "pending_approval" ? null : "approved", notes: null, requestedAt: ago(age + 1), decidedAt: status === "pending_approval" ? null : ago(age) });
    }
    if (published && slug !== "privacy-policy" && slug !== "internal-policy") {
      const signed = status !== "archived" || i % 2 === 0;
      const signer = (name, email, role, ok) => ({ id: `${D}sig-${i + 1}-${role}`, documentId: _id, signerName: name, signerEmail: email, signerRole: role, status: ok ? "signed" : "pending", requestedAt: ago(age), signedAt: ok ? ago(age - 1 > 0 ? age - 1 : 0) : null, signatureData: ok ? `Signed by ${name}` : null, providerId: null, providerRef: null, ipAddress: ok ? "203.0.113.24" : null, userAgent: ok ? "Mozilla/5.0" : null });
      const list = [signer("Authorised Signatory", admin.email, "company", true), signer(values.partyName ?? values.clientName ?? values.employeeName, `counterparty${i}@example.com`, "counterparty", signed)];
      signatures.push({ _id: `${D}sigreq-${i + 1}`, documentId: _id, signers: list, status: signed ? "completed" : "pending", providerName: null, providerDocId: null, expiresAt: fromNow(14), createdAt: ago(age), createdBy: manager.id });
      docs[docs.length - 1].signatures = list;
    }
    auditRows.push(
      { _id: `${D}aud-${i + 1}-a`, action: "document.created", entityType: "document", entityId: _id, entityLabel: title, actorId: maker.id, actorEmail: maker.email, data: {}, createdAt: created.toISOString() },
      { _id: `${D}aud-${i + 1}-b`, action: `document.${status}`, entityType: "document", entityId: _id, entityLabel: title, actorId: manager.id, actorEmail: manager.email, data: { status }, createdAt: updated.toISOString() },
    );
  });
  await db.collection("lpms_documents").insertMany(docs);
  await db.collection("lpms_document_versions").insertMany(versions);
  if (approvals.length) await db.collection("lpms_approvals").insertMany(approvals);
  if (signatures.length) await db.collection("lpms_signatures").insertMany(signatures);
  await db.collection("lpms_audit").insertMany(auditRows);

  return { types: TYPES.length, templates: TYPES.length, documents: docs.length, versions: versions.length, approvals: approvals.length, signatures: signatures.length };
}
