// TMS demo data — programs, batches, students, enrolments, classes, attendance, assignments, submissions, certificates, fee plans, live projects, placements.
import { rng, rint, pick, chance, weighted, ago, audit, dayAgo, dayAhead, personName, slug, phone, COLLEGES, BRANCHES, COMPANIES, CITIES, insertAll } from "./lib.mjs";

const PROGRAMS = [
  { code: "IT-MERN", name: "Full-Stack MERN Development", category: "industrial", tech: "MongoDB, Express, React, Node", weeks: 16, fees: 48000, tools: ["VS Code", "Git", "Postman", "Docker"], outcomes: ["Build production MERN apps", "REST & auth design", "Deploy to cloud"] },
  { code: "IT-GENAI", name: "Generative AI & Agentic Systems", category: "industrial", tech: "Python, LLMs, LangChain", weeks: 12, fees: 55000, tools: ["Python", "OpenAI API", "Vector DBs"], outcomes: ["RAG pipelines", "Tool-using agents", "Evaluation & guardrails"] },
  { code: "IT-DEVOPS", name: "Cloud & DevOps Engineering", category: "industrial", tech: "AWS, Docker, Kubernetes", weeks: 10, fees: 42000, tools: ["AWS", "Terraform", "GitHub Actions"], outcomes: ["CI/CD pipelines", "IaC", "Observability"] },
  { code: "IT-DS", name: "Data Science & Predictive ML", category: "industrial", tech: "Python, Pandas, scikit-learn", weeks: 14, fees: 45000, tools: ["Jupyter", "Pandas", "scikit-learn"], outcomes: ["EDA & feature engineering", "Model training", "MLOps basics"] },
  { code: "IN-MERN", name: "MERN Stack Internship", category: "internship", tech: "React, Node, MongoDB", weeks: 8, fees: 12000, tools: ["Git", "VS Code"], outcomes: ["Ship a real feature", "Code reviews", "Agile delivery"] },
  { code: "IN-GENAI", name: "Generative AI Internship", category: "internship", tech: "Python, LLM APIs", weeks: 8, fees: 15000, tools: ["Python", "OpenAI API"], outcomes: ["Prompt engineering", "Build an AI feature", "Evaluate outputs"] },
  { code: "IN-CV", name: "Computer Vision Internship", category: "internship", tech: "OpenCV, PyTorch", weeks: 8, fees: 15000, tools: ["OpenCV", "PyTorch"], outcomes: ["Image pipelines", "Model fine-tuning", "Edge deploy"] },
  { code: "IN-QA", name: "QA Automation Internship", category: "internship", tech: "Playwright, Jest", weeks: 6, fees: 9000, tools: ["Playwright", "Jest"], outcomes: ["Test strategy", "E2E automation", "CI test gates"] },
];

const TOPICS = ["Course kick-off & tooling", "Core fundamentals", "Data modelling", "APIs & integration", "Authentication & security", "State management", "Testing strategy", "Performance tuning", "Deployment & CI/CD", "Live project sprint", "Code review clinic", "Capstone workshop"];
const ASSIGNMENTS = ["Mini project: core concepts", "API design exercise", "Data model & CRUD lab", "Security hardening task", "Capstone milestone 1", "Capstone milestone 2"];

export async function seedTms(db) {
  const now = ago(0);
  const programs = PROGRAMS.map((p, i) => ({
    _id: `demo-prog-${i + 1}`, programCode: p.code, name: p.name, category: p.category, technology: p.tech, durationWeeks: p.weeks,
    mode: pick(["online", "hybrid", "online"]), fees: p.fees, currency: "INR", description: `${p.name} — mentor-led, project-based program with live projects and placement support.`,
    learningOutcomes: p.outcomes, tools: p.tools, liveProjectCount: p.category === "internship" ? 1 : 2, certificateIncluded: true, placementAssistance: p.category === "industrial", status: "active", ...audit(ago(300)),
  }));

  // batches: 2–3 per program with mixed lifecycle
  const batches = [];
  programs.forEach((p, pi) => {
    const n = 2 + (pi % 2);
    for (let b = 1; b <= n; b++) {
      const state = b === 1 ? "completed" : b === 2 ? "running" : "upcoming";
      const startAgo = state === "completed" ? 150 + b * 10 : state === "running" ? 30 + pi * 3 : -14;
      const dur = p.durationWeeks * 7;
      batches.push({
        _id: `demo-batch-${pi + 1}-${b}`, batchCode: `${p.programCode}-B${b}`, programId: p._id, name: `${p.name.split(" ").slice(0, 3).join(" ")} — Batch ${b}`,
        startDate: dayAgo(startAgo), endDate: dayAhead(-startAgo + dur), timing: pick(["Mon–Fri · 7:00–9:00 PM IST", "Sat–Sun · 10:00 AM–1:00 PM IST", "Mon–Thu · 6:30–8:30 PM IST"]),
        mentorId: null, capacity: 40, mode: p.mode, status: state, notes: null, ...audit(ago(startAgo + 20)), _state: state,
      });
    }
  });

  const students = [];
  const enrollments = [];
  const classes = [];
  const attendance = [];
  const assignments = [];
  const submissions = [];
  const certificates = [];
  const plans = [];
  let sn = 0;

  for (const b of batches) {
    const program = programs.find((p) => p._id === b.programId);
    const size = b._state === "upcoming" ? 4 : b._state === "running" ? rint(7, 9) : rint(5, 7);
    // classes
    const past = b._state === "upcoming" ? 0 : b._state === "running" ? 9 : 12;
    const future = b._state === "completed" ? 0 : 4;
    const batchClasses = [];
    for (let c = 0; c < past + future; c++) {
      const isPast = c < past;
      const daysOffset = isPast ? (past - c) * 3 : -(c - past + 1) * 3; // ago (+) or ahead (-)
      const cls = {
        _id: `demo-class-${b._id.slice(11)}-${c + 1}`, batchId: b._id, programId: program._id, mentorId: null, topic: TOPICS[c % TOPICS.length],
        date: dayAgo(daysOffset), startTime: pick(["10:00", "18:30", "19:00", "11:00"]), durationMinutes: pick([90, 120, 120, 150]),
        meetingLink: "https://meet.google.com/demo-demo", recordingUrl: isPast && chance(0.6) ? "https://example.com/recording" : null, notes: null,
        status: isPast ? "completed" : "scheduled", ...audit(ago(daysOffset + 5)),
      };
      batchClasses.push(cls);
      classes.push(cls);
    }
    const batchAssignments = [];
    const nAssign = b._state === "upcoming" ? 0 : 4;
    for (let a = 0; a < nAssign; a++) {
      const due = b._state === "completed" ? dayAgo(120 - a * 15) : dayAgo(21 - a * 8); // some due in the future for running batches
      const asg = { _id: `demo-asg-${b._id.slice(11)}-${a + 1}`, title: ASSIGNMENTS[a % ASSIGNMENTS.length], description: "Complete the task in the shared repository and submit the link before the deadline.", batchId: b._id, programId: program._id, dueDate: due, maxMarks: 100, attachmentUrl: null, ...audit(ago(60)) };
      batchAssignments.push(asg);
      assignments.push(asg);
    }

    for (let s = 0; s < size; s++) {
      sn++;
      const name = personName();
      const college = pick(COLLEGES);
      const studentState = b._state === "completed" ? weighted([["completed", 8], ["dropped", 1]]) : b._state === "running" ? weighted([["active", 9], ["on_hold", 1], ["dropped", 0.5]]) : "active";
      const sid = `demo-stu-${sn}`;
      students.push({
        _id: sid, studentCode: `STU-${2026}-${String(sn).padStart(4, "0")}`, fullName: name, email: `${slug(name)}.${sn}@students.demo.in`, mobile: phone(), address: `${pick(CITIES)}, India`,
        education: { college, university: college, branch: pick(BRANCHES), semester: pick(["5", "6", "7", "8"]), graduationYear: pick([2025, 2026, 2027]) },
        guardian: { name: personName(), phone: phone(), relation: pick(["Father", "Mother"]) }, links: { resumeUrl: null, linkedin: `https://linkedin.com/in/${slug(name)}`, github: `https://github.com/${slug(name).replace(/\./g, "")}`, photoUrl: null },
        status: studentState, applicationId: null, notes: null, ...audit(ago(rint(40, 200))),
        _meta: { programId: program._id, batchId: b._id, category: program.category, batchState: b._state, fees: program.fees },
      });
      const progress = b._state === "completed" ? (studentState === "completed" ? 100 : rint(40, 80)) : b._state === "running" ? rint(15, 85) : 0;
      enrollments.push({ _id: `demo-enr-${sn}`, studentId: sid, programId: program._id, batchId: b._id, status: studentState, progressPercent: progress, enrolledOn: b.startDate, ...audit(ago(rint(30, 150))) });

      // attendance
      const rate = weighted([[0.95, 3], [0.85, 4], [0.7, 2], [0.55, 1]]);
      for (const cls of batchClasses.filter((c) => c.status === "completed")) {
        const r = rng();
        const status = r < rate ? (chance(0.1) ? "late" : "present") : chance(0.3) ? "excused" : "absent";
        attendance.push({ _id: `demo-att-${cls._id.slice(11)}-${sn}`, classId: cls._id, batchId: b._id, studentId: sid, status, markedAt: new Date(cls.date), markedBy: null });
      }

      // submissions
      for (const asg of batchAssignments) {
        const past = asg.dueDate <= dayAgo(0);
        const status = past ? weighted([["reviewed", 6], ["submitted", 2], ["resubmit", 1], ["pending", 1.5]]) : weighted([["submitted", 2], ["pending", 6]]);
        if (status === "pending") continue;
        const due = new Date(asg.dueDate);
        const submittedAt = new Date(due.getTime() - rint(0, 4) * 86400000 + rint(-3, 3) * 3600000);
        const reviewed = status === "reviewed";
        submissions.push({
          _id: `demo-sub-${asg._id.slice(9)}-${sn}`, assignmentId: asg._id, studentId: sid, status, submissionUrl: `https://github.com/demo/${sid}/${asg._id.slice(-3)}`, note: chance(0.3) ? "Please review the README for setup steps." : null,
          submittedAt, marks: reviewed ? rint(58, 98) : null, feedback: reviewed ? pick(["Clean structure and good test coverage.", "Solid work — handle edge cases in validation.", "Great progress; improve naming and add docs.", "Excellent. Consider pagination for large lists."]) : status === "resubmit" ? "Please fix the failing edge cases and resubmit." : null,
          reviewedAt: reviewed || status === "resubmit" ? new Date(submittedAt.getTime() + 2 * 86400000) : null, reviewedBy: reviewed || status === "resubmit" ? "demo-mentor" : null,
        });
      }

      // certificate
      if (studentState === "completed") {
        certificates.push({
          _id: `demo-cert-${sn}`, certificateNumber: `YO-CERT-2026-${String(sn).padStart(5, "0")}`, verificationCode: `DEMO${String(sn).padStart(6, "0")}VER`, type: program.category === "internship" ? "internship" : "industrial_training",
          studentId: sid, programId: program._id, batchId: b._id, title: program.name, issuedOn: dayAgo(rint(5, 90)), grade: pick(["A+", "A", "A", "B+", "B"]), revoked: false, revokedReason: null, ...audit(ago(rint(5, 90))),
        });
      }

      // fee plan
      const total = program.fees;
      const discount = chance(0.25) ? pick([1000, 2000, 3000]) : 0;
      const net = total - discount;
      const paidFraction = weighted([[1, 4], [0.66, 3], [0.33, 2], [0, 1]]);
      const target = Math.round(net * paidFraction);
      const installments = [];
      let remaining = target;
      let k = 0;
      while (remaining > 0 && k < 3) {
        const amt = k === 2 || remaining < net / 3 + 1 ? remaining : Math.min(remaining, Math.round(net / 3));
        installments.push({ id: `demo-inst-${sn}-${k + 1}`, amount: amt, method: pick(["UPI", "Bank Transfer", "Card"]), transactionId: `TXN${rint(100000, 999999)}`, paidOn: dayAgo(rint(5, 120) + (2 - k) * 20), invoiceNumber: `INV-2026-D${String(sn * 3 + k).padStart(4, "0")}`, note: null, recordedBy: "demo", recordedAt: ago(rint(5, 120)) });
        remaining -= amt;
        k++;
      }
      plans.push({ _id: `demo-plan-${sn}`, studentId: sid, programId: program._id, batchId: b._id, enrollmentId: `demo-enr-${sn}`, totalFees: total, currency: "INR", discount, installments, notes: null, ...audit(ago(rint(30, 150))) });
    }
  }

  // live projects (per running/completed batch, groups of students)
  const liveProjects = [];
  batches.filter((b) => b._state !== "upcoming").forEach((b, i) => {
    const ss = students.filter((s) => s._meta.batchId === b._id && s.status !== "dropped").slice(0, 4);
    if (!ss.length) return;
    const done = b._state === "completed";
    const ms = ["Requirements & design", "Core build", "Integration & testing", "Demo & handover"].map((t, m) => ({ id: `demo-lpm-${i}-${m}`, title: t, done: done ? true : m < rint(1, 3), dueDate: dayAhead(-(60 - m * 15)) }));
    liveProjects.push({
      _id: `demo-lp-${i + 1}`, projectCode: `LP-2026-${String(i + 1).padStart(3, "0")}`, title: pick(["Smart Attendance Portal", "AI Support Copilot", "Inventory Analytics Dashboard", "Job Match Engine", "Expense Tracker PWA", "Learning Analytics Suite"]) + ` #${i + 1}`,
      description: "Team project built on a realistic brief, reviewed weekly by the mentor.", programId: b.programId, batchId: b._id, mentorId: null, studentIds: ss.map((s) => s._id), milestones: ms,
      repoUrl: "https://github.com/demo-demo/live-project", demoUrl: done ? "https://demo.example.com/project" : null, status: done ? "completed" : pick(["in_progress", "review", "in_progress"]), progressPercent: done ? 100 : Math.round((ms.filter((m) => m.done).length / ms.length) * 100), startDate: b.startDate, dueDate: dayAhead(20), ...audit(ago(40)),
    });
  });

  // placements for completed industrial students
  const placements = students
    .filter((s) => s.status === "completed" && s._meta.category === "industrial")
    .slice(0, 14)
    .map((s, i) => ({ _id: `demo-plc-${i + 1}`, studentId: s._id, programId: s._meta.programId, company: pick(COMPANIES), role: pick(["Software Engineer", "Full-Stack Developer", "ML Engineer", "DevOps Engineer", "Data Analyst"]), packageLpa: pick([4.5, 6, 7.5, 9, 12, 14]), location: pick(CITIES), type: pick(["campus", "off_campus", "referral"]), placedOn: dayAgo(rint(2, 60)), offerLetterUrl: null, notes: null, ...audit(ago(rint(2, 60))) }));

  const strip = (d) => {
    const { _meta, _state, ...rest } = d;
    return rest;
  };
  const wipe = async (name) => db.collection(name).deleteMany({ _id: /^demo-/ });
  // The base seeder (seed-all-products-demo.mjs) wrote TMS docs in a different, non-app shape (no fullName / programCode / …). They render as
  // nameless rows in the TMS product and can't be opened, so remove exactly those legacy-shaped docs — real app-created records are never touched.
  const legacy = { training_programs: { programCode: { $exists: false } }, training_batches: { programId: { $exists: false } }, training_students: { fullName: { $exists: false } }, student_enrollments: { programId: { $exists: false } }, class_schedules: { programId: { $exists: false } }, class_attendance: { classId: { $exists: false } }, assignments: { programId: { $exists: false } }, assignment_submissions: { assignmentId: /^ASG-/ }, certificates: { certificateNumber: { $exists: false } }, placement_records: { company: { $exists: false } } };
  for (const [name, filter] of Object.entries(legacy)) await db.collection(name).deleteMany(filter);
  for (const c of ["training_programs", "training_batches", "training_students", "student_enrollments", "class_schedules", "class_attendance", "assignments", "assignment_submissions", "certificates", "payments", "live_projects", "placement_records"]) await wipe(c);
  await insertAll(db.collection("training_programs"), programs);
  await insertAll(db.collection("training_batches"), batches.map(strip));
  await insertAll(db.collection("training_students"), students.map(strip));
  await insertAll(db.collection("student_enrollments"), enrollments);
  await insertAll(db.collection("class_schedules"), classes);
  await insertAll(db.collection("class_attendance"), attendance);
  await insertAll(db.collection("assignments"), assignments);
  await insertAll(db.collection("assignment_submissions"), submissions);
  await insertAll(db.collection("certificates"), certificates);
  await insertAll(db.collection("payments"), plans);
  await insertAll(db.collection("live_projects"), liveProjects);
  await insertAll(db.collection("placement_records"), placements);
  console.log(`  ✓ TMS: ${programs.length} programs, ${batches.length} batches, ${students.length} students, ${classes.length} classes, ${attendance.length} attendance, ${assignments.length} assignments, ${submissions.length} submissions, ${certificates.length} certificates, ${plans.length} fee plans, ${liveProjects.length} live projects, ${placements.length} placements`);
  return { programs, batches, students, enrollments, plans, certificates, submissions, assignments, classes, now };
}
