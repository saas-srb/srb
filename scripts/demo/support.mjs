// Help & Support demo data: realistic requests from this company's users, with staff replies, internal notes, AI triage and status
// history. The Support Center is a platform-level service, so its collections are shared and every row carries the company id.
// Idempotent: everything it creates has a `demo-sup-` id and is replaced on each run.
import { ago } from "./lib.mjs";

const D = "demo-sup-";

const REQUESTS = [
  ["help", "How do I add a new employee and give them access to Projects?", "I created the employee in HR but they cannot see the Projects product.", "hrms", "normal", null, "resolved", "support", 18, "Open Settings → Users, pick the employee and add the Projects role. Access applies on their next sign-in."],
  ["bug", "Payslip PDF shows the wrong month", "Downloaded the payslip for September but the header says August.", "hrms", "high", "major", "in-progress", "engineering", 6, "We can reproduce this and a fix is being tested."],
  ["technical", "Invoice email is not reaching the client", "FMS says the invoice was sent, but the client has not received anything.", "fms", "high", "major", "waiting", "support", 4, "Could you confirm the client's email address and check their spam folder?"],
  ["feature", "Bulk import for leads from Excel", "We receive 300+ leads after every campaign and add them one by one.", "lms", "normal", null, "triaged", "product", 9, null],
  ["improvement", "Show project budget on the board cards", "Managers want to see the remaining budget without opening each project.", "pms", "low", null, "submitted", null, 2, null],
  ["bug", "Certificate verification page shows a blank screen", "Opening the public verify link on mobile Safari shows a white page.", "tms", "high", "minor", "resolved", "engineering", 25, "Fixed in this week's release. Please retry the link."],
  ["help", "Can we change the approval steps for purchase orders?", "We need a second approver above INR 5 lakh.", "prms", "normal", null, "closed", "support", 40, "Yes, configure thresholds in Settings → Approvals. A short guide is linked in the article."],
  ["feedback", "The new dashboard is faster", "Just wanted to say the workspace dashboard now loads much quicker.", "workspace", "low", null, "closed", null, 33, "Thank you, this is great to hear."],
  ["technical", "Social post stuck on 'pending approval'", "A scheduled post did not go out because it never reached the approver.", "smms", "normal", "minor", "in-progress", "support", 3, "We found the approver was missing a role and are fixing it with you."],
  ["other", "Need a data export for our auditor", "Please share the steps to export the last financial year's ledger.", "fms", "normal", null, "resolved", "support", 14, "Use FMS → Reports → Ledger → Export. We have also attached the steps."],
];

export async function seedSupport(db, { companyId, companyName, owner }) {
  const requests = db.collection("support_requests");
  const messages = db.collection("support_messages");
  const counters = db.collection("support_counters");

  const old = await requests.find({ companyId, _id: new RegExp(`^${D}`) }, { projection: { _id: 1 } }).toArray();
  if (old.length) {
    await messages.deleteMany({ requestId: { $in: old.map((r) => r._id) } });
    await requests.deleteMany({ _id: { $in: old.map((r) => r._id) } });
  }

  const reqDocs = [], msgDocs = [];
  for (const [i, [type, title, description, panel, priority, severity, status, team, age, reply]] of REQUESTS.entries()) {
    const seq = await counters.findOneAndUpdate({ _id: "request" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    const _id = `${D}${companyId.slice(0, 8)}-${i + 1}`;
    const created = ago(age), updated = ago(Math.max(age - 2, 0));
    const done = status === "resolved" || status === "closed";
    reqDocs.push({
      _id, number: seq?.seq ?? i + 1, companyId, companyName, createdBy: { id: owner.id, email: owner.email }, type, title, description, category: panel, priority, severity, status, team,
      assignee: team ? { id: "demo-staff", email: "support@example.com" } : null, fields: {}, 
      context: { panel, page: null, route: `/${panel}`, feature: null, browser: "Chrome", browserVersion: "126", os: "macOS", device: "Desktop", userAgent: null, viewport: "1440x900", timestamp: created.toISOString(), errorInfo: type === "bug" ? "TypeError: undefined is not an object" : null },
      source: i % 3 === 0 ? "chat" : "form", chat: [], attachments: [],
      ai: { at: created.toISOString(), summary: title, category: panel, priority, team, duplicateOf: [], similarCount: i % 4, suggestedReply: reply ?? "Thanks for reaching out. We are looking into this.", articles: [], note: null },
      history: [
        { at: created, by: owner.email, action: "created", from: null, to: "submitted" },
        ...(status !== "submitted" ? [{ at: ago(Math.max(age - 1, 0)), by: "support@example.com", action: "status", from: "submitted", to: status }] : []),
      ],
      lastActor: reply ? "staff" : "company", createdAt: created, updatedAt: updated, resolvedAt: done ? updated : null,
    });
    msgDocs.push({ _id: `${_id}-m1`, requestId: _id, companyId, authorType: "company", visibility: "public", authorId: owner.id, authorLabel: owner.email, body: description, createdAt: created });
    if (reply) {
      msgDocs.push({ _id: `${_id}-m2`, requestId: _id, companyId, authorType: "staff", visibility: "public", authorId: "demo-staff", authorLabel: "Support team", body: reply, createdAt: ago(Math.max(age - 1, 0)) });
      msgDocs.push({ _id: `${_id}-m3`, requestId: _id, companyId, authorType: "staff", visibility: "internal", authorId: "demo-staff", authorLabel: "Support team", body: "Checked the account; no billing or access issue on our side.", createdAt: ago(Math.max(age - 1, 0)) });
    }
  }
  await requests.insertMany(reqDocs);
  await messages.insertMany(msgDocs);
  return { requests: reqDocs.length, messages: msgDocs.length };
}
