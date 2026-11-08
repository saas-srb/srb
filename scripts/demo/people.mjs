// External-portal people: accounts for all four user types (+ lead-only signups), their leads / timelines / messages / documents,
// career applications, interviews and job offers. Every account is linked to the TMS / PMS / recruitment records seeded elsewhere.
import { ObjectId } from "mongodb";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { rng, rint, pick, chance, weighted, shuffle, ago, fromNow, audit, hashPassword, personName, slug, phone, insertAll } from "./lib.mjs";

const WORKFLOWS = {
  job_applicant: [["new_lead", "Application received"], ["contacted", "Recruiter reached out"], ["shortlisted", "Shortlisted"], ["interview_scheduled", "Interview scheduled"], ["technical_round", "Technical round"], ["hr_round", "HR round"], ["selected", "Selected"], ["offer_released", "Offer released"], ["joined", "Joined", "won"], ["rejected", "Not moving forward", "lost"]],
  intern: [["new", "Application received"], ["contacted", "Team reached out"], ["enrolled", "Enrolled"], ["batch_assigned", "Batch assigned"], ["training_started", "Training started"], ["live_project", "Live project"], ["completed", "Internship completed"], ["certificate_issued", "Certificate issued", "won"], ["dropped", "Discontinued", "lost"]],
  trainee: [["new", "Application received"], ["enrolled", "Enrolled"], ["batch_assigned", "Batch assigned"], ["classes_running", "Classes running"], ["live_project", "Live project"], ["assessment", "Assessment"], ["completed", "Training completed"], ["certificate_issued", "Certificate issued", "won"], ["dropped", "Discontinued", "lost"]],
  client: [["new_inquiry", "Inquiry received"], ["requirement_discussion", "Requirement discussion"], ["proposal_shared", "Proposal shared"], ["negotiation", "Negotiation"], ["project_started", "Project started"], ["development", "In development"], ["delivery", "Delivery"], ["support", "Support & maintenance", "won"], ["closed_lost", "Closed", "lost"]],
};
const SOURCE_FOR = { job_applicant: "job_portal", intern: "internship", trainee: "industrial_training" };
const CLIENT_SOURCES = ["software_development", "ai_automation", "client_inquiry"];
const CLIENT_SUB = { software_development: ["web-app-development", "mobile-app-development"], ai_automation: ["conversational-ai", "computer-vision"], client_inquiry: [null], resource_augmentation: ["single-resource", "package-based-team", "hourly-on-demand", "project-based"] };
const POSITIONS = [["mern-developer", "MERN Developer"], ["genai-developer", "GenAI Developer"], ["ai-ml-engineer", "AI/ML Engineer"], ["ui-ux-designer", "UI/UX Designer"], ["business-development-manager", "Business Development Manager"], ["hr-executive", "HR Executive"], ["quality-analyst", "Quality Analyst"]];
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const refCode = () => Array.from({ length: 8 }, () => REF_ALPHABET[Math.floor(rng() * REF_ALPHABET.length)]).join("");
const PASSWORD = "Demo@12345";

export const DEMO_ACCOUNTS = [
  { key: "student", email: "demo.student@example.com", label: "Student (industrial training)" },
  { key: "intern", email: "demo.intern@example.com", label: "Intern" },
  { key: "client", email: "demo.client@example.com", label: "Client" },
  { key: "business", email: "demo.business@example.com", label: "Business (hiring + services)" },
  { key: "hiring", email: "demo.hiring@example.com", label: "Hiring (job applicant)" },
];

export async function seedPeople(db, tms, pms) {
  const passwordHash = hashPassword(PASSWORD);
  const users = [];
  const leads = [];
  const timeline = [];
  const messages = [];
  const documents = [];
  const interviews = [];
  const careerApps = [];
  const offers = [];
  const notifications = [];
  let ln = 0;
  let mn = 0;
  let tn = 0;

  const portalDocDir = path.join(process.cwd(), "uploads", "portal-documents");
  await mkdir(portalDocDir, { recursive: true });

  function newUser({ role, name, email, createdAgo, links = {}, rich = false, fixed = null }) {
    const id = `demo-user-${users.length + 1}`;
    const u = {
      _id: id, email, phone: phone(), passwordHash, role, applicationId: links.applicationId ?? null, studentId: links.studentId ?? null, clientId: links.clientId ?? null, displayName: name,
      status: "active", failedLoginAttempts: 0, lockedUntil: null, mustChangePassword: false, createdAt: ago(createdAgo), updatedAt: ago(rint(0, 5)), lastLoginAt: ago(rint(0, 6)),
      leadId: null, activeLeadId: null, referralCode: refCode(), referredByCode: null,
      _rich: rich, _fixed: fixed, _leads: [], _stageEvents: [], _createdAgo: createdAgo,
    };
    users.push(u);
    return u;
  }

  /** Creates a lead for the user that has progressed to `stageIdx`, with a dated timeline and portal-visible messages. */
  function addLead(u, { type, source, subService, stageIdx, message = null, links = {} }) {
    const flow = WORKFLOWS[type];
    const idx = Math.min(stageIdx, flow.length - 1);
    const created = new Date(u.createdAt.getTime() + rint(0, 3) * 3600000);
    const totalMs = Math.max(3600000, Date.now() - created.getTime() - 3600000);
    const [stageKey, stageLabel, terminal] = flow[idx];
    // dates for each completed step, evenly spread from creation to "now"
    const stepTimes = Array.from({ length: idx + 1 }, (_, i) => new Date(created.getTime() + (totalMs * i) / Math.max(1, idx + 0.4)));
    const lead = {
      _id: `demo-lead-${++ln}`, code: `LEAD-2026-${String(9000 + ln).padStart(4, "0")}`, type, source, name: u.displayName, email: u.email, phone: u.phone, subService: subService ?? null, message,
      stage: stageKey, stageEnteredAt: stepTimes[idx], status: terminal ?? "open", externalUserId: u._id, ownerStaffId: null, hasUnreadPortalReply: false, sourceRef: null, applicationId: links.applicationId ?? null, offerId: links.offerId ?? null,
      studentId: links.studentId ?? null, clientId: links.clientId ?? null, projectId: links.projectId ?? null, createdAt: created, updatedAt: stepTimes[idx], createdBy: null, updatedBy: null, deletedAt: null,
    };
    leads.push(lead);
    u._leads.push(lead);
    if (!u.leadId) {
      u.leadId = lead._id;
      u.activeLeadId = lead._id;
    }
    const ev = (kind, title, detail, at, actor = "system", visible = true) => timeline.push({ _id: `demo-tl-${++tn}`, leadId: lead._id, kind, title, detail, actor, actorId: null, visibleToLead: visible, createdAt: at });
    ev("account_created", "Portal account created", "Signed in automatically from the website form.", created);
    ev("lead_submitted", "Request submitted", subService ? `Interest: ${subService}` : null, new Date(created.getTime() + 60000), "applicant");
    for (let i = 1; i <= idx; i++) {
      ev("stage_changed", `Stage: ${flow[i][1]}`, null, stepTimes[i], "staff");
      if (flow[i][2] !== "lost") u._stageEvents.push({ key: flow[i][0], label: flow[i][1], ts: stepTimes[i], type });
      notifications.push({ _id: `demo-nt-${notifications.length + 1}`, recipientUserId: u._id, type: "status_update", title: "Status updated", body: `Your request is now: ${flow[i][1]}.`, link: "/clientos/journey", read: i < idx - 1 || chance(0.5), dedupeKey: null, createdAt: stepTimes[i] });
    }
    if (stageKey === "certificate_issued") ev("certificate_issued", "Certificate issued", null, stepTimes[idx]);
    if (stageKey === "offer_released") ev("offer_released", "Offer released", null, stepTimes[idx], "system", false);
    const msgs = [
      ["message", `Hi ${u.displayName.split(" ")[0]}, thanks for reaching out — I'm your point of contact. Let me know if you have any questions.`],
      ["status_update", `Your progress has moved to "${stageLabel}". Check My Journey for what's next.`],
      ["document_request", "Please upload your latest documents so we can complete the next step."],
      ["message", "A quick reminder — your next session details are on the schedule page."],
    ].slice(0, u._rich ? 4 : rint(1, 3));
    msgs.forEach(([channel, body], i) => {
      const at = new Date(created.getTime() + (totalMs * (i + 1)) / (msgs.length + 1));
      messages.push({ _id: `demo-msg-${++mn}`, leadId: lead._id, body, visibility: "portal", channel, authorType: "staff", authorStaffId: null, authorPortalUserId: null, attachments: [], createdAt: at });
      ev("message_sent", "Message from our team", body.slice(0, 80), at, "staff");
    });
    return lead;
  }

  async function addDoc(u, lead, name, category, body) {
    const key = `demo-pdoc-${documents.length + 1}.txt`;
    await writeFile(path.join(portalDocDir, key), `${name}\n\n${body}\n\n(Demo document generated by the Demo Company demo seeder.)\n`);
    documents.push({ _id: `demo-pdoc-${documents.length + 1}`, ownerUserId: u._id, leadId: lead._id, name: `${name}.txt`, storageKey: key, contentType: "text/plain", size: 200, category, uploadedBy: "demo-staff", createdAt: ago(rint(1, 40)), deletedAt: null });
  }

  const studentsBy = (cat, states) => tms.students.filter((s) => s._meta.category === cat && states.includes(s._meta.batchState));
  const activeRunning = (cat) => tms.students.filter((s) => s._meta.category === cat && s._meta.batchState === "running" && s.status === "active");

  // --- students: trainees + interns -------------------------------------------------------------
  const fixedStudent = activeRunning("industrial")[0];
  const fixedIntern = activeRunning("internship")[0];
  const traineePool = [fixedStudent, ...shuffle(tms.students.filter((s) => s._meta.category === "industrial" && s !== fixedStudent))].slice(0, 44);
  const internPool = [fixedIntern, ...shuffle(tms.students.filter((s) => s._meta.category === "internship" && s !== fixedIntern))].slice(0, 30);

  function learnerStage(s, role) {
    const st = s._meta.batchState;
    if (s.status === "dropped") return WORKFLOWS[role].length - 1;
    if (role === "trainee") return st === "upcoming" ? 2 : st === "running" ? pick([3, 3, 4, 5]) : s.status === "completed" ? pick([6, 7, 7]) : 5;
    return st === "upcoming" ? 3 : st === "running" ? pick([4, 4, 5]) : s.status === "completed" ? pick([6, 7, 7]) : 5;
  }
  for (const [pool, role] of [[traineePool, "trainee"], [internPool, "intern"]]) {
    for (const s of pool) {
      const fixed = s === fixedStudent ? DEMO_ACCOUNTS[0] : s === fixedIntern ? DEMO_ACCOUNTS[1] : null;
      const u = newUser({ role, name: s.fullName, email: fixed ? fixed.email : s.email, createdAgo: rint(60, 200), links: { studentId: s._id }, rich: Boolean(fixed), fixed: fixed?.key });
      u.phone = s.mobile;
      const lead = addLead(u, { type: role, source: SOURCE_FOR[role], subService: role === "intern" ? "mern-stack" : "web-development", stageIdx: learnerStage(s, role), message: "Interested in the program — please share the batch details.", links: { studentId: s._id } });
      await addDoc(u, lead, role === "intern" ? "Internship welcome kit" : "Program handbook", "Program", "Batch schedule, mentor contacts, assessment policy and certification criteria.");
      if (chance(0.5) || fixed) await addDoc(u, lead, "Fee receipt", "Finance", "Payment receipt for your enrolment instalment.");
    }
  }

  // --- clients + businesses ---------------------------------------------------------------------
  pms.clients.forEach((c, i) => {
    const fixed = i === 0 ? DEMO_ACCOUNTS[2] : i === 1 ? DEMO_ACCOUNTS[3] : null;
    const contact = c.primaryContact;
    const u = newUser({ role: "client", name: contact.name, email: fixed ? fixed.email : contact.email, createdAgo: rint(120, 380), links: { clientId: c._id }, rich: Boolean(fixed), fixed: fixed?.key });
    u.phone = contact.phone;
    const src = pick(CLIENT_SOURCES);
    const firstProj = pms.projects.find((p) => p.clientId === c._id);
    const stageIdx = c.status === "prospect" ? 1 : firstProj?.status === "completed" ? 7 : firstProj?.status === "planning" ? 4 : pick([4, 5, 5, 6]);
    addLead(u, { type: "client", source: src, subService: pick(CLIENT_SUB[src]), stageIdx, message: `We'd like to discuss a ${firstProj?.category ?? "software"} engagement.`, links: { clientId: c._id, projectId: firstProj?._id ?? null } });
    // business accounts: extra hiring / resource-augmentation requirements
    if (i === 1 || (i > 1 && i % 3 === 0)) {
      const n = i === 1 ? 3 : rint(1, 2);
      for (let k = 0; k < n; k++) addLead(u, { type: "client", source: "resource_augmentation", subService: pick(CLIENT_SUB.resource_augmentation), stageIdx: pick([0, 1, 2, 3, 4, 5]), message: "We need dedicated developers for an ongoing product.", links: { clientId: c._id } });
      u._business = true;
    }
  });

  // --- job applicants (career applications, interviews, offers) ---------------------------------
  const APPLICANTS = 26;
  for (let i = 0; i < APPLICANTS; i++) {
    const fixed = i === 0 ? DEMO_ACCOUNTS[4] : null;
    const name = personName();
    const email = fixed ? fixed.email : `${slug(name)}.${100 + i}@jobs.demo.in`;
    const [posSlug, posTitle] = POSITIONS[i % POSITIONS.length];
    const stageIdx = fixed ? 7 : weighted([[0, 2], [1, 3], [2, 3], [3, 3], [4, 2], [5, 2], [6, 2], [7, 2], [8, 1.5], [9, 3]]);
    const statusFor = (k) => ["new", "under_review", "shortlisted", "interview_scheduled", "interview_scheduled", "interview_scheduled", "selected", "selected", "hired", "rejected"][k];
    const oid = new ObjectId();
    const appCreated = ago(rint(20, 150));
    careerApps.push({ _id: oid, positionId: null, positionSlug: posSlug, positionTitle: posTitle, name, email, phone: phone(), coverNote: "I'm excited about this role and bring hands-on experience with the stack.", resume: { storageKey: `demo-resume-${i + 1}.pdf`, filename: `${slug(name)}-resume.pdf`, contentType: "application/pdf", size: rint(90000, 260000) }, status: statusFor(stageIdx), notes: stageIdx >= 2 ? "Strong profile; moving forward." : undefined, source: pick(["careers-page", "linkedin", "referral"]), createdAt: appCreated, updatedAt: ago(rint(0, 14)), _demo: true });
    const applicationId = oid.toString();
    const u = newUser({ role: "job_applicant", name, email, createdAgo: rint(20, 150), links: { applicationId }, rich: Boolean(fixed), fixed: fixed?.key });
    const lead = addLead(u, { type: "job_applicant", source: "job_portal", subService: posTitle, stageIdx, message: "Please consider my application.", links: { applicationId } });
    // interviews
    if (fixed) interviews.push({ _id: `demo-iv-${interviews.length + 1}`, leadId: lead._id, applicationId, title: `Joining formalities — ${posTitle}`, round: "Onboarding call", mode: "video", scheduledAt: fromNow(3), durationMins: 30, location: null, meetingLink: "https://meet.google.com/demo-onboarding", product: "HR team", status: "scheduled", notes: null, createdBy: null, createdAt: ago(2), updatedAt: ago(1) });
    if (stageIdx >= 3 && stageIdx !== 9) {
      const rounds = stageIdx >= 5 ? ["Screening", "Technical round", "HR round"] : stageIdx === 4 ? ["Screening", "Technical round"] : ["Screening"];
      rounds.forEach((round, r) => {
        const isLast = r === rounds.length - 1;
        const upcoming = !fixed && isLast && stageIdx <= 5 && chance(0.6);
        interviews.push({ _id: `demo-iv-${interviews.length + 1}`, leadId: lead._id, applicationId, title: `${round} — ${posTitle}`, round, mode: pick(["video", "video", "onsite", "phone"]), scheduledAt: upcoming ? fromNow(rint(1, 6)) : ago(rint(2, 14) + (rounds.length - r) * 3), durationMins: pick([30, 45, 60]), location: null, meetingLink: "https://meet.google.com/demo-interview", product: pick(["Engineering product", "Hiring manager + tech lead", "HR team"]), status: upcoming ? "scheduled" : "completed", notes: null, createdBy: null, createdAt: ago(20), updatedAt: ago(2) });
      });
    }
    // offers
    if (stageIdx === 7 || stageIdx === 8) {
      const ctc = pick([420000, 600000, 850000, 1200000]);
      const offerId = `demo-offer-${offers.length + 1}`;
      offers.push({ _id: offerId, applicationId, candidateName: name, candidateEmail: email, positionTitle: posTitle, positionSlug: posSlug, status: stageIdx === 8 ? "joined" : "extended", offerDate: ago(rint(3, 20)).toISOString().slice(0, 10), proposedJoiningDate: fromNow(rint(10, 40)).toISOString().slice(0, 10), annualCtc: ctc, notes: null, employeeId: null, ...audit(ago(10)) });
      lead.offerId = offerId;
    }
    await addDoc(u, lead, "Candidate guide", "Recruitment", "Interview process, expectations and how to prepare.");
  }
  // extra unlinked applications so the careers / HRMS recruitment screens are full
  for (let i = 0; i < 180; i++) {
    const name = personName();
    const [posSlug, posTitle] = POSITIONS[i % POSITIONS.length];
    const oid = new ObjectId();
    const status = pick(["new", "under_review", "shortlisted", "interview_scheduled", "selected", "hired", "rejected"]);
    const email = `${slug(name)}.${300 + i}@applicants.demo.in`;
    careerApps.push({ _id: oid, positionId: null, positionSlug: posSlug, positionTitle: posTitle, name, email, phone: phone(), coverNote: "Sharing my profile for the role.", resume: { storageKey: `demo-resume-x${i + 1}.pdf`, filename: `${slug(name)}-cv.pdf`, contentType: "application/pdf", size: rint(90000, 260000) }, status, source: pick(["careers-page", "linkedin", "referral"]), createdAt: ago(rint(1, 120)), updatedAt: ago(rint(0, 30)), _demo: true });
    if (status === "selected" || status === "hired") offers.push({ _id: `demo-offer-${offers.length + 1}`, applicationId: oid.toString(), candidateName: name, candidateEmail: email, positionTitle: posTitle, positionSlug: posSlug, status: pick(["draft", "extended", "accepted", "joined", "declined"]), offerDate: ago(rint(3, 40)).toISOString().slice(0, 10), proposedJoiningDate: fromNow(rint(10, 50)).toISOString().slice(0, 10), annualCtc: pick([420000, 600000, 850000, 1200000]), notes: null, employeeId: null, ...audit(ago(12)) });
  }

  // --- lead-only signups (brand-new accounts with no domain record yet) -------------------------
  for (let i = 0; i < 44; i++) {
    const role = weighted([["trainee", 3], ["intern", 3], ["client", 2], ["job_applicant", 2]]);
    const name = personName();
    const u = newUser({ role, name, email: `${slug(name)}.${500 + i}@newuser.demo.in`, createdAgo: rint(1, 45) });
    const src = role === "client" ? pick([...CLIENT_SOURCES, "resource_augmentation"]) : SOURCE_FOR[role];
    addLead(u, { type: role, source: src, subService: role === "client" ? pick(CLIENT_SUB[src]) : role === "intern" ? "generative-ai" : role === "trainee" ? "cloud-devops" : "MERN Developer", stageIdx: chance(0.7) ? 0 : 1, message: "Just signed up — looking forward to getting started." });
  }

  // welcome notifications for everyone
  for (const u of users) {
    notifications.push({ _id: `demo-nt-${notifications.length + 1}`, recipientUserId: u._id, type: "welcome", title: `Welcome to the ${u.role === "client" ? "Client" : u.role === "job_applicant" ? "Applicant" : u.role === "intern" ? "Internship" : "Industrial Training"} Portal`, body: "Your account is ready. Everything here updates live as our team progresses your request.", link: "/clientos", read: chance(0.8), dedupeKey: null, createdAt: u.createdAt });
  }

  const clean = (arr) => arr.map(({ _rich, _fixed, _leads, _stageEvents, _createdAgo, _business, ...rest }) => rest);
  const wipeIds = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });
  for (const c of ["external_users", "lead_records", "lead_timeline", "lead_messages", "portal_documents", "portal_interviews", "hrms_offers", "external_notifications"]) await wipeIds(c);
  await db.collection("career_applications").deleteMany({ _demo: true });
  await insertAll(db.collection("external_users"), clean(users));
  await insertAll(db.collection("lead_records"), leads);
  await insertAll(db.collection("lead_timeline"), timeline);
  await insertAll(db.collection("lead_messages"), messages);
  await insertAll(db.collection("portal_documents"), documents);
  await insertAll(db.collection("portal_interviews"), interviews);
  await insertAll(db.collection("hrms_offers"), offers);
  await insertAll(db.collection("career_applications"), careerApps);
  console.log(`  ✓ Portal people: ${users.length} accounts (${users.filter((u) => u.role === "trainee").length} students, ${users.filter((u) => u.role === "intern").length} interns, ${users.filter((u) => u.role === "client").length} clients/businesses, ${users.filter((u) => u.role === "job_applicant").length} applicants), ${leads.length} leads, ${timeline.length} timeline events, ${messages.length} messages, ${documents.length} documents, ${interviews.length} interviews, ${offers.length} job offers, ${careerApps.length} career applications`);
  return { users, leads, notifications, offers, interviews, passwordHash };
}

export async function flushNotifications(db, notifications) {
  await insertAll(db.collection("external_notifications"), notifications.filter((n) => !n._flushed));
}
