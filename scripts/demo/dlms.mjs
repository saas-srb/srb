// DLMS (Digi Locker) demo data: four logins (admin / manager / two employees with different client assignments) and a spread of
// company + client credentials, URLs/accounts, notes and (file-less) documents, including items expired and expiring soon.
// Passwords are encrypted exactly like the app does (AES-256-GCM, record id as AAD) when DLMS_ENCRYPTION_KEY is set.
// Idempotent: every row it creates has a `demo-dlms-` id and is replaced on each run.
import { ObjectId } from "mongodb";
import { createCipheriv, randomBytes } from "node:crypto";
import { hashPassword, dayAgo, dayAhead, audit, ago } from "./lib.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-dlms-";

export const DLMS_DEMO_ACCOUNTS = [
  { email: "demo.dlms.admin@example.com", label: "DLMS Admin (everything)", roles: ["dlms_admin"] },
  { email: "demo.dlms.manager@example.com", label: "DLMS Manager (all scopes, no settings)", roles: ["dlms_manager"] },
  { email: "demo.dlms.employee@example.com", label: "DLMS Employee — 2 clients + company vault", roles: ["dlms_employee"], clients: 2, company: true },
  { email: "demo.dlms.limited@example.com", label: "DLMS Employee — 1 client only", roles: ["dlms_employee"], clients: 1, company: false },
];

function encrypt(plain, recordId) {
  const raw = process.env.DLMS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(recordId, "utf8"));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { c: enc.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64") };
}

export async function seedDlms(db) {
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);
  for (const c of ["dlms_credentials", "dlms_documents", "dlms_links", "dlms_notes", "dlms_activity_logs"]) await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });

  // clients: reuse the PMS client master (never a copy); only create demo ones if the master is empty.
  let clients = await db.collection("pms_clients").find({ deletedAt: null }).sort({ companyName: 1 }).limit(4).toArray();
  if (clients.length === 0) {
    clients = ["Acme Labs", "Nimbus Cloud", "Zenith Health"].map((name, i) => ({
      _id: `${D}cli-${i + 1}`, clientCode: `DLMS-CLI-${i + 1}`, companyName: name, industry: "SaaS", website: `https://${name.toLowerCase().replace(/\W+/g, "")}.example.com`, status: "active",
      primaryContact: { name: "Demo Contact", email: `contact@${name.toLowerCase().replace(/\W+/g, "")}.example.com`, phone: null, designation: null },
      billing: { addressLine: null, city: "Bengaluru", country: "India", gstin: null, currency: "INR", paymentTermsDays: 30 }, notes: null, tags: [], ...audit(),
    }));
    await db.collection("pms_clients").insertMany(clients);
  }

  const users = {};
  for (const a of DLMS_DEMO_ACCOUNTS) {
    const local = a.email.split("@")[0].replace("demo.dlms.", "");
    let userId = (await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } }))?._id ?? new ObjectId();
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { email: a.email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: null, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: userId, createdAt: now } },
      { upsert: true }
    );
    users[local] = userId.toString();
    if (a.clients !== undefined) {
      await db.collection("dlms_access").updateOne({ _id: userId.toString() }, { $set: { companyAccess: a.company, clientIds: clients.slice(0, a.clients).map((c) => c._id), updatedAt: now, updatedBy: users.admin } }, { upsert: true });
    }
  }
  const by = users.manager;
  const stamp = (days) => audit(ago(days), by);

  const rows = { credentials: [], documents: [], links: [], notes: [] };
  let n = 0;
  const cred = (scope, clientId, name, category, username, url, pw, expiryDate, notes = null, days = 40) => {
    const _id = `${D}cr-${++n}`;
    rows.credentials.push({ _id, scope, clientId, name, category, status: "active", expiryDate, notes, username, loginUrl: url, passwordEnc: pw ? encrypt(pw, _id) : null, passwordUpdatedAt: pw ? ago(days) : null, ...stamp(days) });
    return _id;
  };
  const link = (scope, clientId, name, category, url, account, credentialId, expiryDate, notes = null) =>
    rows.links.push({ _id: `${D}ln-${++n}`, scope, clientId, name, category, status: "active", expiryDate, notes, url, account, credentialId, ...stamp(30) });
  const note = (scope, clientId, name, category, body) => rows.notes.push({ _id: `${D}nt-${++n}`, scope, clientId, name, category, status: "active", expiryDate: null, notes: null, body, ...stamp(20) });
  const doc = (scope, clientId, name, category, description, expiryDate) => {
    const _id = `${D}dc-${++n}`;
    rows.documents.push({
      _id, scope, clientId, name, category, status: "active", expiryDate, notes: null, description: `${description} (demo record — no file attached)`,
      versions: [{ version: 1, storageKey: `dlms-files/${_id}.pdf`, filename: `${name.toLowerCase().replace(/\W+/g, "-")}.pdf`, contentType: "application/pdf", size: 120000, kind: "pdf", uploadedBy: by, uploadedAt: ago(25), note: null }],
      currentVersion: 1, ...stamp(25),
    });
  };

  // ── Company vault
  const hosting = cred("company", null, "AWS root account", "cloud", "aws-root@example.com", "https://console.aws.amazon.com", "Demo-Aws!2026-x9", dayAhead(120), "MFA device is in the safe.");
  cred("company", null, "GoDaddy — domain registrar", "domain", "domains@example.com", "https://sso.godaddy.com", "Demo-Gd!Reg-77", dayAhead(9), "Auto-renew is OFF — renew manually.");
  cred("company", null, "Google Workspace super admin", "email", "admin@example.com", "https://admin.google.com", "Demo-Gw#Admin-31", null);
  cred("company", null, "GST portal", "government", "27AAAAA0000A1Z5", "https://www.gst.gov.in", "Demo-Gst$Port-19", dayAgo(4), "Password rotation overdue.");
  cred("company", null, "Razorpay API secret", "api", "rzp_live_demo", "https://dashboard.razorpay.com", "Demo-Rzp*Secret-55", dayAhead(200));
  cred("company", null, "Company LinkedIn page", "social", "social@example.com", "https://www.linkedin.com", null, null);
  link("company", null, "Company website", "website", "https://example.com", "example.com", null, null);
  link("company", null, "Primary domain", "domain", "https://sso.godaddy.com", "example.com", null, dayAhead(9), "Renewal due soon.");
  link("company", null, "AWS console", "cloud", "https://console.aws.amazon.com", "Account 4821-…", hosting, null);
  link("company", null, "Main Git organisation", "git", "https://github.com/demo", "demo", null, null);
  note("company", null, "Where the company secrets live", "general", "Every shared login belongs in the Credential Vault, not in chat or docs. Ask a DLMS manager to grant access.");
  note("company", null, "Incident access procedure", "access_instructions", "In an outage: (1) page the on-call, (2) request break-glass access from a DLMS manager, (3) every reveal is logged.");
  doc("company", null, "Certificate of Incorporation", "company_documents", "Company registration", null);
  doc("company", null, "GST registration certificate", "certificates", "GSTIN registration", null);
  doc("company", null, "Office lease agreement", "agreements", "Registered office lease", dayAhead(20));
  doc("company", null, "Trade licence", "licenses", "Municipal trade licence", dayAgo(15));

  // ── Client vaults
  clients.forEach((c, i) => {
    const id = c._id;
    const short = c.companyName.split(" ")[0];
    const host = cred("client", id, `${short} — web hosting`, "hosting", `ops@${short.toLowerCase()}.example.com`, "https://hosting.example.com", `Demo-${short}-Host!${i}`, i === 0 ? dayAhead(14) : dayAhead(240));
    cred("client", id, `${short} — CMS admin`, "admin", "admin", `https://${short.toLowerCase()}.example.com/wp-admin`, `Demo-${short}-Cms#${i}`, null);
    if (i === 1) cred("client", id, `${short} — old FTP (retired)`, "database", "ftp-user", null, `Demo-${short}-Ftp$${i}`, dayAgo(30), "Retired — delete after handover.");
    link("client", id, `${short} — production site`, "website", c.website || `https://${short.toLowerCase()}.example.com`, null, null, null);
    link("client", id, `${short} — hosting product`, "hosting", "https://hosting.example.com", `${short}-acct`, host, i === 0 ? dayAhead(14) : null);
    note("client", id, `${short} — deployment notes`, "deployment", `Deploys go out on Tuesdays after client sign-off.\nStaging: staging.${short.toLowerCase()}.example.com`);
    doc("client", id, `${short} — master services agreement`, "agreements", "Signed MSA", i === 0 ? dayAhead(25) : dayAhead(300));
    if (i === 0) doc("client", id, `${short} — KYC pack`, "kyc", "Company KYC documents", null);
  });

  for (const [col, list] of [["dlms_credentials", rows.credentials], ["dlms_documents", rows.documents], ["dlms_links", rows.links], ["dlms_notes", rows.notes]]) {
    if (list.length) await db.collection(col).insertMany(list);
  }
  const auditRows = [
    { _id: `${D}au-1`, actorId: users.manager, actorEmail: "demo.dlms.manager@example.com", action: "create", entity: "credential", entityId: rows.credentials[0]._id, entityLabel: rows.credentials[0].name, scope: "company", clientId: null, summary: `Created credential "${rows.credentials[0].name}" (password stored)`, metadata: null, createdAt: ago(40) },
    { _id: `${D}au-2`, actorId: users.employee, actorEmail: "demo.dlms.employee@example.com", action: "reveal", entity: "credential", entityId: rows.credentials[6]._id, entityLabel: rows.credentials[6].name, scope: "client", clientId: rows.credentials[6].clientId, summary: `Revealed the password of "${rows.credentials[6].name}"`, metadata: null, createdAt: ago(2) },
  ];
  await db.collection("dlms_activity_logs").insertMany(auditRows);
  return { credentials: rows.credentials.length, documents: rows.documents.length, links: rows.links.length, notes: rows.notes.length, encrypted: Boolean(process.env.DLMS_ENCRYPTION_KEY) };
}
