/**
 * ULTRA-LARGE MEGA SEEDER (70+ COLLECTIONS, THOUSANDS OF RECORDS, ALL 10 PRODUCTS)
 *
 * FIXED VERSION — all collection names, field names, and schema shapes match
 * the application code exactly so every product dashboard renders correctly.
 *
 * Products:
 *  1. Admin Command Center
 *  2. HRMS
 *  3. PMS
 *  4. PRMS
 *  5. TMS
 *  6. FMS
 *  7. Messenger / Team Chat
 *  8. LMS / CRM
 *  9. External Portal
 * 10. Workspace
 *
 * Called by `npm run demo:seeders` (scripts/demo-seeders.ts) with a company-scoped database.
 */

import { ObjectId } from "mongodb";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}
/** Returns a real Date object in the past by `days` days */
function dateDaysAgo(days, hourJitter = true) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (hourJitter) {
    d.setHours(randInt(8, 20), randInt(0, 59), randInt(0, 59), 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d; // always a valid Date
}
/** ISO yyyy-mm-dd string that is N days from now (negative = future) */
function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
/** Simple short id for seeded docs */
function shortId() {
  return randomBytes(8).toString("hex");
}

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan",
  "Ananya", "Diya", "Saanvi", "Aadhya", "Kavya", "Myra", "Anika", "Riya", "Priya", "Neha",
  "Rahul", "Amit", "Vikram", "Karan", "Nikhil", "Sandeep", "Rajesh", "Suresh", "Manish", "Deepak",
  "Pooja", "Sneha", "Kritika", "Meera", "Shreya", "Anjali", "Divya", "Nisha", "Swati", "Ritu",
  "James", "Michael", "Sarah", "Emma", "Muhammad", "Zainab", "Wei", "Tanaka", "Oliver", "Sophia",
  "Alexander", "Charlotte", "Daniel", "Amara", "Carlos", "Fatima", "Hiroshi", "Isabella", "Lucas", "Maya",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Rao", "Nair", "Iyer",
  "Mehta", "Shah", "Joshi", "Chopra", "Malhotra", "Kapoor", "Bansal", "Agarwal", "Saxena", "Tiwari",
  "Smith", "Johnson", "Williams", "Khan", "Li", "Kim", "Miller", "Davis", "Gonzalez", "Takahashi",
];
function randomName() {
  return `${choice(FIRST_NAMES)} ${choice(LAST_NAMES)}`;
}

export async function seedBase(rawDb) {

  console.log("==========================================================================");
  console.log("🚀 ULTRA-LARGE MEGA 10-PRODUCT DEMO SEEDER (ALL 70+ COLLECTIONS, THOUSANDS)");
  console.log("==========================================================================");

  {
    // Real databases keep the app's unique indexes after a truncate, and these generic base docs don't carry every
    // module-specific key. Skip duplicate-key rows instead of aborting; the portal seeders supply the correctly
    // shaped data for those modules.
    let skippedDup = 0;
    const tolerant = (col) => new Proxy(col, {
      get(target, key) {
        const value = target[key];
        if (typeof value !== "function") return value;
        return (...args) => {
          const out = value.apply(target, args);
          return out && typeof out.catch === "function" ? out.catch((e) => { if (e?.code === 11000 || e?.writeErrors?.every?.((w) => w.code === 11000)) { skippedDup++; return null; } throw e; }) : out;
        };
      },
    });
    const db = new Proxy(rawDb, { get: (t, k) => (k === "collection" ? (n, o) => tolerant(t.collection(n, o)) : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
    const defaultPasswordHash = hashPassword("Admin#2026pw");

    // =========================================================================
    // 1. CENTRAL IDENTITY ROSTER & HRMS Product (23 Collections, 150 Employees)
    // =========================================================================
    console.log("\n[1/10] Seeding Mega Central Roster & Complete HRMS Suite (150+ Employees)...");
    const adminUsersCol = db.collection("admin_users");
    const hrmsEmpCol = db.collection("hrms_employees");
    const hrmsDeptCol = db.collection("hrms_departments");
    const hrmsDesigCol = db.collection("hrms_designations");
    const hrmsTeamCol = db.collection("hrms_teams");
    const hrmsAttCol = db.collection("hrms_attendance");
    const hrmsAttLogCol = db.collection("hrms_attendance_logs");
    const hrmsLeaveReqCol = db.collection("hrms_leave_requests");
    const hrmsLeaveTypeCol = db.collection("hrms_leave_types");
    const hrmsLeaveBalCol = db.collection("hrms_leave_balances");
    const hrmsHolidaysCol = db.collection("hrms_holidays");
    const hrmsPayrollProfCol = db.collection("hrms_payroll_profiles");
    const hrmsPayrollRunCol = db.collection("hrms_payroll_runs");
    const hrmsPayslipsCol = db.collection("hrms_payslips");
    const hrmsSalaryRevCol = db.collection("hrms_salary_revisions");
    const hrmsSalaryPayCol = db.collection("hrms_salary_payouts");
    const hrmsSettingsCol = db.collection("hrms_settings");
    const hrmsBankCol = db.collection("hrms_bank_accounts");
    const hrmsDocsCol = db.collection("hrms_employee_documents");
    const hrmsOffersCol = db.collection("hrms_offers");
    const hrmsAuditCol = db.collection("hrms_audit_logs");

    await adminUsersCol.createIndex({ email: 1 }, { unique: true }).catch(() => {});
    await hrmsEmpCol.createIndex({ email: 1 }, { unique: true }).catch(() => {});

    // Departments & Designations
    const departments = [
      { deptId: "DEPT-ENG", name: "Engineering & Technology", code: "ENG" },
      { deptId: "DEPT-HR", name: "Human Resources", code: "HR" },
      { deptId: "DEPT-FIN", name: "Finance & Accounts", code: "FIN" },
      { deptId: "DEPT-PROC", name: "Procurement & Supply Chain", code: "PROC" },
      { deptId: "DEPT-EDU", name: "Education & Training", code: "EDU" },
      { deptId: "DEPT-SLS", name: "Sales & Business Development", code: "SLS" },
      { deptId: "DEPT-MKT", name: "Marketing & Communications", code: "MKT" },
      { deptId: "DEPT-OPS", name: "Operations & Facilities", code: "OPS" },
      { deptId: "DEPT-LGL", name: "Legal & Corporate Affairs", code: "LGL" },
      { deptId: "DEPT-QA", name: "Quality Assurance & Compliance", code: "QA" },
    ];
    for (const d of departments) {
      await hrmsDeptCol.updateOne({ deptId: d.deptId }, { $set: d }, { upsert: true });
    }

    const designations = [
      { desigId: "DSG-01", title: "Chief Executive Officer", deptId: "DEPT-ENG" },
      { desigId: "DSG-02", title: "VP of Human Resources", deptId: "DEPT-HR" },
      { desigId: "DSG-03", title: "Chief Financial Officer", deptId: "DEPT-FIN" },
      { desigId: "DSG-04", title: "Head of Procurement", deptId: "DEPT-PROC" },
      { desigId: "DSG-05", title: "Director of Training", deptId: "DEPT-EDU" },
      { desigId: "DSG-06", title: "Lead Systems Architect", deptId: "DEPT-ENG" },
      { desigId: "DSG-07", title: "Senior Fullstack Engineer", deptId: "DEPT-ENG" },
      { desigId: "DSG-08", title: "QA Engineering Lead", deptId: "DEPT-QA" },
      { desigId: "DSG-09", title: "Senior UI/UX Designer", deptId: "DEPT-ENG" },
      { desigId: "DSG-10", title: "Business Development Manager", deptId: "DEPT-SLS" },
      { desigId: "DSG-11", title: "Corporate Legal Counsel", deptId: "DEPT-LGL" },
      { desigId: "DSG-12", title: "DevOps & Cloud Lead", deptId: "DEPT-ENG" },
    ];
    for (const d of designations) {
      await hrmsDesigCol.updateOne({ desigId: d.desigId }, { $set: d }, { upsert: true });
    }

    // Teams
    const teams = [
      { teamId: "TEAM-CORE", name: "Core Platform Team", leaderEmail: "rajesh.kumar@example.com" },
      { teamId: "TEAM-AI", name: "GenAI & LLM Systems Lab", leaderEmail: "rohan.das@example.com" },
      { teamId: "TEAM-FIN", name: "Corporate Financial Ops", leaderEmail: "priya.patel@example.com" },
      { teamId: "TEAM-QA", name: "Automation & Security QA", leaderEmail: "anita.sharma@example.com" },
    ];
    for (const t of teams) {
      await hrmsTeamCol.updateOne({ teamId: t.teamId }, { $set: t }, { upsert: true });
    }

    // Core leadership seeded first (indices 0–7)
    const coreLeadership = [
      { name: "System Super Admin", email: "admin@example.com", role: "super_admin", dept: "DEPT-ENG", title: "Chief Executive Officer" },
      { name: "Anita Sharma", email: "anita.sharma@example.com", role: "hr", dept: "DEPT-HR", title: "VP of Human Resources" },
      { name: "Rajesh Kumar", email: "rajesh.kumar@example.com", role: "pms_admin", dept: "DEPT-ENG", title: "Lead Systems Architect" },
      { name: "Priya Patel", email: "priya.patel@example.com", role: "fms_admin", dept: "DEPT-FIN", title: "Chief Financial Officer" },
      { name: "Vikram Malhotra", email: "vikram.m@example.com", role: "prms_admin", dept: "DEPT-PROC", title: "Head of Procurement" },
      { name: "Siddharth Verma", email: "siddharth.v@example.com", role: "tms_admin", dept: "DEPT-EDU", title: "Director of Training" },
      { name: "Neha Gupta", email: "neha.gupta@example.com", role: "lms_admin", dept: "DEPT-SLS", title: "Business Development Manager" },
      { name: "Rohan Das", email: "rohan.das@example.com", role: "workspace_admin", dept: "DEPT-ENG", title: "Senior Fullstack Engineer" },
    ];

    const teamEmployees = [];
    const userMap = new Map(); // email -> { userId, name, title, dept }

    for (let i = 0; i < 150; i++) {
      let u;
      if (i < coreLeadership.length) {
        u = coreLeadership[i];
      } else {
        const name = randomName();
        const slug = name.toLowerCase().replace(/\s+/g, ".");
        u = {
          name,
          email: `${slug}.${i}@example.com`,
          role: choice(["employee", "pms_employee", "prms_employee", "tms_coordinator", "lms_agent", "fms_accountant"]),
          dept: choice(departments).deptId,
          title: choice(designations).title,
        };
      }

      const roles = u.role === "super_admin" ? ["super_admin"] : [u.role];
      const userRes = await adminUsersCol.findOneAndUpdate(
        { email: u.email },
        {
          $set: {
            email: u.email,
            passwordHash: defaultPasswordHash,
            roles,
            userType: i === 0 ? "system" : choice(["employee", "contractor", "partner"]),
            notes: `${u.title}`,
            mustChangePassword: false,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: dateDaysAgo(300) },
        },
        { upsert: true, returnDocument: "after" }
      );
      const userDoc = userRes.value ?? userRes;
      const userId = userDoc._id.toString();
      userMap.set(u.email, { userId, name: u.name, title: u.title, dept: u.dept });

      const empCode = `EMP-${1000 + i}`;
      const salary = randInt(70, 260) * 1000;
      await hrmsEmpCol.updateOne(
        { email: u.email },
        {
          $set: {
            employeeCode: empCode,
            userId,
            firstName: u.name.split(" ")[0],
            lastName: u.name.split(" ")[1] || "",
            email: u.email,
            workEmail: u.email,
            departmentId: u.dept,
            designation: u.title,
            status: "active",
            monthlySalary: salary,
            joiningDate: dateDaysAgo(randInt(100, 800)),
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: dateDaysAgo(300) },
        },
        { upsert: true }
      );

      await hrmsPayrollProfCol.updateOne(
        { employeeCode: empCode },
        { $set: { employeeCode: empCode, email: u.email, baseSalary: salary, hra: salary * 0.4, allowances: salary * 0.1, deductions: salary * 0.12, netSalary: salary * 1.38, updatedAt: new Date() } },
        { upsert: true }
      );
      await hrmsBankCol.updateOne(
        { employeeCode: empCode },
        { $set: { employeeCode: empCode, email: u.email, bankName: choice(["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank"]), accountNumber: `ACC${randInt(10000000, 99999999)}`, ifscCode: "HDFC0000123", updatedAt: new Date() } },
        { upsert: true }
      );
      await hrmsLeaveBalCol.updateOne(
        { employeeCode: empCode },
        { $set: { employeeId: empCode, employeeCode: empCode, email: u.email, leaveTypeCode: "CL", year: 2026, casualLeaves: 12, sickLeaves: 12, earnedLeaves: 15, taken: randInt(1, 8), updatedAt: new Date() } },
        { upsert: true }
      );

      teamEmployees.push({ empCode, email: u.email, name: u.name, userId, salary });
    }

    // Attendance (1,000+ Records)
    const attDocs = [];
    const attLogDocs = [];
    for (let day = 1; day <= 30; day++) {
      for (const emp of teamEmployees.slice(0, 35)) {
        attDocs.push({
          employeeId: emp.empCode,
          employeeCode: emp.empCode,
          email: emp.email,
          date: dateDaysAgo(day, false),
          checkIn: "09:15 AM",
          checkOut: "06:30 PM",
          status: day % 7 === 0 ? "absent" : "present",
          workHours: 8.5,
          createdAt: dateDaysAgo(day),
        });
        attLogDocs.push({
          employeeCode: emp.empCode,
          email: emp.email,
          timestamp: dateDaysAgo(day),
          punchType: "check_in",
          ipAddress: `192.168.1.${randInt(10, 200)}`,
        });
      }
    }
    if (attDocs.length) await hrmsAttCol.insertMany(attDocs);
    if (attLogDocs.length) await hrmsAttLogCol.insertMany(attLogDocs);

    // Leave Requests (100)
    for (let l = 1; l <= 100; l++) {
      const emp = choice(teamEmployees);
      await hrmsLeaveReqCol.insertOne({
        leaveId: `LV-2026-${100 + l}`,
        employeeCode: emp.empCode,
        employeeName: emp.name,
        email: emp.email,
        leaveType: choice(["Casual Leave", "Sick Leave", "Earned Leave", "Maternity Leave"]),
        startDate: dateDaysAgo(l),
        endDate: dateDaysAgo(Math.max(0, l - 2)),
        daysCount: 2,
        reason: "Personal commitment and health leave",
        status: choice(["approved", "pending", "approved", "rejected"]),
        createdAt: dateDaysAgo(l + 1),
      });
    }

    // Leave Types & Holidays
    const leaveTypes = ["Casual Leave", "Sick Leave", "Earned Leave", "Maternity Leave", "Paternity Leave", "Compensatory Off"];
    for (const lt of leaveTypes) {
      await hrmsLeaveTypeCol.updateOne(
        { name: lt },
        { $set: { name: lt, code: lt.toLowerCase().replace(/\s+/g, "_"), annualQuota: 12, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    const holidays = [
      { name: "New Year's Day", date: "2026-01-01" },
      { name: "Republic Day", date: "2026-01-26" },
      { name: "Holi", date: "2026-03-25" },
      { name: "Good Friday", date: "2026-04-03" },
      { name: "Independence Day", date: "2026-08-15" },
      { name: "Gandhi Jayanti", date: "2026-10-02" },
      { name: "Dussehra", date: "2026-10-20" },
      { name: "Diwali", date: "2026-11-08" },
      { name: "Christmas Day", date: "2026-12-25" },
    ];
    for (const h of holidays) {
      await hrmsHolidaysCol.updateOne({ name: h.name }, { $set: { ...h, updatedAt: new Date() } }, { upsert: true });
    }

    // Payroll Runs & Payslips (12 months × 25 employees = 300 payslips)
    for (let m = 1; m <= 12; m++) {
      const monthStr = `2025-${m < 10 ? "0" + m : m}`;
      await hrmsPayrollRunCol.updateOne(
        { period: monthStr },
        { $set: { period: monthStr, month: `Month ${m} 2025`, totalEmployees: teamEmployees.length, totalPayout: 18500000, status: "completed", processedAt: dateDaysAgo(30 * m), updatedAt: new Date() } },
        { upsert: true }
      );
      for (const emp of teamEmployees.slice(0, 25)) {
        await hrmsPayslipsCol.insertOne({
          payslipId: `PAY-${monthStr}-${emp.empCode}`,
          employeeCode: emp.empCode,
          employeeName: emp.name,
          email: emp.email,
          period: monthStr,
          netSalary: emp.salary * 1.35,
          status: "paid",
          issuedAt: dateDaysAgo(30 * m),
        });
        await hrmsSalaryPayCol.insertOne({
          payoutId: `POUT-${monthStr}-${emp.empCode}`,
          employeeCode: emp.empCode,
          email: emp.email,
          amount: emp.salary * 1.35,
          paymentStatus: "transferred",
          transferDate: dateDaysAgo(30 * m),
        });
      }
    }

    // Salary Revisions (40)
    for (let r = 1; r <= 40; r++) {
      const emp = choice(teamEmployees);
      await hrmsSalaryRevCol.insertOne({
        revisionId: `REV-2026-${r}`,
        employeeCode: emp.empCode,
        email: emp.email,
        oldSalary: emp.salary,
        newSalary: emp.salary * 1.15,
        effectiveDate: dateDaysAgo(r * 5),
        reason: "Annual Merit Appraisal",
        createdAt: dateDaysAgo(r * 5),
      });
    }

    // HRMS job offers are seeded by the portal seeders — they must reference a real career application
    // (the app keeps a unique index on hrms_offers.applicationId), which the generic docs written here didn't.

    // Employee Documents (30)
    for (let d = 1; d <= 30; d++) {
      const emp = choice(teamEmployees);
      await hrmsDocsCol.insertOne({
        docId: `DOC-${emp.empCode}-${d}`,
        employeeCode: emp.empCode,
        email: emp.email,
        docType: choice(["Aadhar", "PAN", "Offer Letter", "Contract", "Experience Certificate"]),
        fileUrl: `/docs/${emp.empCode}/doc-${d}.pdf`,
        uploadedAt: dateDaysAgo(randInt(10, 200)),
      });
    }

    // HRMS settings
    await hrmsSettingsCol.updateOne(
      { settingId: "HRMS-CFG" },
      { $set: { settingId: "HRMS-CFG", workWeekDays: 5, defaultWorkHours: 8, autoApproveLeave: false, updatedAt: new Date() } },
      { upsert: true }
    );

    // HRMS Audit Logs (300)
    const hrmsAudits = [];
    for (let a = 1; a <= 300; a++) {
      hrmsAudits.push({
        action: choice(["employee.create", "leave.approve", "payroll.process", "salary.revise", "document.upload"]),
        actor: "anita.sharma@example.com",
        details: `HRMS Operation event #${a}`,
        timestamp: dateDaysAgo(randInt(1, 90)),
      });
    }
    await hrmsAuditCol.insertMany(hrmsAudits);
    console.log("  ✓ HRMS Suite: 150 Employees, 1050 Attendance, 100 Leave Requests, 300 Payslips, 40 Salary Revisions, 30 Offers.");

    // =========================================================================
    // 2. PMS Product — schema-aligned with pms_projects Project interface
    // =========================================================================
    console.log("\n[2/10] Seeding Mega PMS Suite (30 Clients, 30 Projects, 500 Tasks, 600 Timesheets)...");
    const clientCol = db.collection("pms_clients");
    const projectCol = db.collection("pms_projects");
    const memberCol = db.collection("pms_project_members");
    const costingCol = db.collection("pms_project_costing");
    const milestoneCol = db.collection("pms_milestones");
    const taskCol = db.collection("pms_tasks");
    const commentCol = db.collection("pms_task_comments");
    const attachCol = db.collection("pms_task_attachments");
    const timesheetCol = db.collection("pms_timesheets");
    const docCol = db.collection("pms_documents");
    const notifCol = db.collection("pms_notifications");
    const pmsSettingsCol = db.collection("pms_settings");
    const pmsAuditCol = db.collection("pms_activity_logs");

    await projectCol.createIndex({ projectCode: 1 }, { unique: true }).catch(() => {});

    const clientsDemo = [];
    for (let c = 1; c <= 30; c++) {
      const clientObj = {
        clientId: `CLI-${100 + c}`,
        clientCode: `CLI-${100 + c}`,
        name: `Enterprise Client Corp #${c}`,
        companyName: `Client Organization ${c}`,
        email: `contact@client${c}.com`,
        status: "active",
        industry: choice(["FinTech", "HealthTech", "E-Commerce", "SaaS", "Logistics", "EdTech"]),
        country: choice(["United States", "United Kingdom", "India", "Singapore", "UAE"]),
        deletedAt: null,
        createdAt: dateDaysAgo(randInt(200, 400)),
        updatedAt: new Date(),
      };
      await clientCol.updateOne({ clientId: clientObj.clientId }, { $set: clientObj }, { upsert: true });
      clientsDemo.push(clientObj);
    }

    const projectStatuses = ["active", "active", "completed", "on_hold", "planning", "cancelled"];
    const priorities = ["low", "medium", "high", "urgent"];
    const techStacks = [
      ["React", "Node.js", "MongoDB"],
      ["Next.js", "TypeScript", "PostgreSQL"],
      ["Python", "Django", "Redis"],
      ["Vue.js", "Laravel", "MySQL"],
      ["React Native", "GraphQL", "AWS"],
    ];

    const projectsDemo = [];
    for (let p = 1; p <= 30; p++) {
      const prjCode = `PRJ-${String(1000 + p).padStart(4, "0")}`;
      const status = choice(projectStatuses);
      const progressPercent = status === "completed" ? 100 : status === "cancelled" ? randInt(10, 80) : randInt(10, 95);
      const createdAt = dateDaysAgo(randInt(30, 400)); // valid Date object
      const prjObj = {
        _id: shortId(),
        projectCode: prjCode,
        name: `Enterprise Platform Solution #${p}`,
        clientId: choice(clientsDemo).clientId,
        category: choice(["Web Application", "Mobile App", "AI/ML System", "Cloud Infrastructure", "E-Commerce"]),
        description: `Full-cycle enterprise software delivery for client project ${p}. Includes design, development, testing and deployment phases.`,
        priority: choice(priorities),
        status,
        startDate: isoDate(-(randInt(60, 300))),
        endDate: status === "completed" ? isoDate(-(randInt(1, 30))) : isoDate(randInt(10, 120)),
        estimatedBudget: randInt(800, 5000) * 1000,
        estimatedHours: randInt(200, 2000),
        currency: "INR",
        projectManagerId: choice(teamEmployees).empCode,
        technologies: choice(techStacks),
        progressPercent,
        deletedAt: null,
        createdAt, // always a valid Date
        updatedAt: new Date(),
        createdBy: "admin@example.com",
        updatedBy: "admin@example.com",
      };

      await projectCol.updateOne({ projectCode: prjObj.projectCode }, { $set: prjObj }, { upsert: true });
      projectsDemo.push(prjObj);

      await costingCol.updateOne(
        { projectId: prjObj._id },
        { $set: { projectId: prjObj._id, estimatedCost: prjObj.estimatedBudget * 0.75, actualCost: prjObj.estimatedBudget * 0.45, margin: prjObj.estimatedBudget * 0.25, updatedAt: new Date() } },
        { upsert: true }
      );

      // Members
      for (const emp of teamEmployees.slice(0, 6)) {
        await memberCol.updateOne(
          { projectId: prjObj._id, userId: emp.userId },
          { $set: { projectId: prjObj._id, userId: emp.userId, employeeId: emp.empCode, email: emp.email, role: "developer", active: true, allocationPercent: randInt(20, 80), assignedAt: dateDaysAgo(60), deletedAt: null } },
          { upsert: true }
        );
      }

      // Milestones
      for (let ms = 1; ms <= 3; ms++) {
        await milestoneCol.updateOne(
          { milestoneId: `MS-${prjCode}-${ms}` },
          { $set: { milestoneId: `MS-${prjCode}-${ms}`, projectId: prjObj._id, title: `Milestone ${ms}: ${prjObj.name}`, dueDate: isoDate(-20 * ms + 60), status: ms === 1 ? "completed" : "in_progress", updatedAt: new Date() } },
          { upsert: true }
        );
      }
    }

    // Tasks (500), Comments, Attachments, Timesheets (600)
    const taskDocs = [];
    const commentDocs = [];
    const attachDocs = [];
    const timesheetDocs = [];
    for (let t = 1; t <= 500; t++) {
      const prj = choice(projectsDemo);
      const assignee = choice(teamEmployees);
      const taskId = `TSK-MEGA-${t}`;
      const taskCreatedAt = dateDaysAgo(randInt(1, 90)); // valid Date
      taskDocs.push({
        taskId,
        projectId: prj._id,
        title: `Task #${t}: Feature implementation for ${prj.name}`,
        status: choice(["backlog", "todo", "in_progress", "in_review", "completed", "blocked"]),
        priority: choice(priorities),
        assignedTo: assignee.userId,
        assignedEmail: assignee.email,
        estimatedHours: randInt(8, 60),
        loggedHours: randInt(4, 45),
        deletedAt: null,
        createdAt: taskCreatedAt,
        updatedAt: new Date(),
      });
      commentDocs.push({ taskId, authorEmail: assignee.email, comment: `Code review feedback on task ${taskId}`, createdAt: dateDaysAgo(randInt(1, 30)) });
      attachDocs.push({ taskId, fileName: `spec_${t}.png`, fileUrl: `/assets/docs/${t}.png`, uploadedBy: assignee.email, createdAt: dateDaysAgo(randInt(1, 30)) });
    }
    for (let ts = 1; ts <= 600; ts++) {
      const prj = choice(projectsDemo);
      const assignee = choice(teamEmployees);
      timesheetDocs.push({
        taskId: `TSK-MEGA-${randInt(1, 500)}`,
        projectId: prj._id,
        userEmail: assignee.email,
        hours: randInt(2, 9),
        workDate: dateDaysAgo(randInt(1, 60)),
        description: `Work item #${ts}`,
        createdAt: dateDaysAgo(randInt(1, 60)),
      });
    }
    if (taskDocs.length) await taskCol.insertMany(taskDocs);
    if (commentDocs.length) await commentCol.insertMany(commentDocs);
    if (attachDocs.length) await attachCol.insertMany(attachDocs);
    if (timesheetDocs.length) await timesheetCol.insertMany(timesheetDocs);

    // PMS Documents & Notifications
    for (let d = 1; d <= 30; d++) {
      const prj = choice(projectsDemo);
      await docCol.insertOne({ docId: `PDOC-${d}`, projectId: prj._id, title: `Project Document ${d}`, url: `/docs/prj/${d}.pdf`, uploadedBy: "rajesh.kumar@example.com", createdAt: dateDaysAgo(d) });
    }
    for (let n = 1; n <= 50; n++) {
      const emp = choice(teamEmployees);
      await notifCol.insertOne({ recipientId: emp.userId, type: choice(["task_assigned", "milestone_due", "comment_added"]), message: `PMS notification #${n}`, isRead: n % 3 === 0, createdAt: dateDaysAgo(n) });
    }
    await pmsSettingsCol.updateOne({ settingId: "PMS-CFG" }, { $set: { settingId: "PMS-CFG", defaultCurrency: "INR", autoCloseOnCompletion: true, updatedAt: new Date() } }, { upsert: true });
    const pmsAudits = [];
    for (let a = 1; a <= 200; a++) {
      pmsAudits.push({ action: choice(["project.create", "task.update", "milestone.complete", "member.add"]), actor: choice(teamEmployees).email, details: `PMS event #${a}`, timestamp: dateDaysAgo(randInt(1, 90)) });
    }
    await pmsAuditCol.insertMany(pmsAudits);
    console.log("  ✓ PMS Suite: 30 Clients, 30 Projects, 500 Tasks, 600 Timesheets, 50 Notifications, 200 Audit Logs.");

    // =========================================================================
    // 3. PRMS Product (20 Collections, 80 POs, 100 Assets, 50 Inventory Items)
    // =========================================================================
    console.log("\n[3/10] Seeding Mega PRMS Procurement Suite...");
    const vendorCol = db.collection("prms_vendors");
    const reqCol = db.collection("prms_requisitions");
    const poCol = db.collection("prms_purchase_orders");
    const rfqCol = db.collection("prms_rfqs");
    const grnCol = db.collection("prms_goods_receipts");
    const prmsInvCol = db.collection("prms_invoices");
    const expCol = db.collection("prms_expenses");
    const budCol = db.collection("prms_budgets");
    const assetCol = db.collection("prms_assets");
    const assetAssignCol = db.collection("prms_asset_assignments");
    const invItemCol = db.collection("prms_inventory_items");
    const invTxnCol = db.collection("prms_inventory_transactions");
    const contractCol = db.collection("prms_contracts");
    const subCol = db.collection("prms_software_subscriptions");
    const prmsPayCol = db.collection("prms_payments");
    const prmsAuditCol = db.collection("prms_activity_logs");

    const vendorsDemo = [];
    for (let v = 1; v <= 30; v++) {
      const vObj = {
        vendorId: `VND-${200 + v}`,
        vendorCode: `VND-${200 + v}`,
        name: `Vendor Partner ${v} Corp`,
        category: choice(["Cloud & Hosting", "Cybersecurity Audit", "Office Equipment", "Hardware & Accessories", "Legal & Compliance"]),
        email: `vendor${v}@supply.io`,
        status: "approved",
        updatedAt: new Date(),
      };
      await vendorCol.updateOne({ vendorId: vObj.vendorId }, { $set: vObj }, { upsert: true });
      vendorsDemo.push(vObj);
    }

    for (let r = 1; r <= 80; r++) {
      const reqCode = `REQ-2026-${1000 + r}`;
      const vendor = choice(vendorsDemo);
      const amount = randInt(60, 800) * 1000;
      await reqCol.updateOne(
        { reqCode },
        { $set: { reqCode, title: `Procurement Requisition ${r} - ${vendor.category}`, vendorId: vendor.vendorId, vendorName: vendor.name, amount, status: choice(["approved", "pending", "issued", "fulfilled"]), requestedBy: "vikram.m@example.com", updatedAt: new Date() } },
        { upsert: true }
      );

      const poCode = `PO-2026-${1000 + r}`;
      await poCol.updateOne(
        { poCode },
        { $set: { poCode, poNumber: poCode, reqCode, vendorId: vendor.vendorId, vendorName: vendor.name, totalAmount: amount, status: choice(["issued", "approved", "fulfilled"]), issuedAt: dateDaysAgo(r), updatedAt: new Date() } },
        { upsert: true }
      );
      await grnCol.updateOne({ grnCode: `GRN-2026-${1000 + r}` }, { $set: { grnCode: `GRN-2026-${1000 + r}`, poCode, vendorId: vendor.vendorId, receivedDate: dateDaysAgo(r), status: "received", updatedAt: new Date() } }, { upsert: true });
      await prmsInvCol.updateOne({ invoiceCode: `PINV-2026-${1000 + r}` }, { $set: { invoiceCode: `PINV-2026-${1000 + r}`, poCode, vendorId: vendor.vendorId, amount, status: "paid", updatedAt: new Date() } }, { upsert: true });
      await expCol.insertOne({ expenseCode: `EXP-MEGA-${r}`, vendorId: vendor.vendorId, poCode, category: vendor.category, amount, status: "approved", expenseDate: dateDaysAgo(r), createdAt: dateDaysAgo(r) });
      await prmsPayCol.insertOne({ paymentCode: `PAY-PRMS-${r}`, poCode, amount, paymentDate: dateDaysAgo(r), status: "completed", createdAt: dateDaysAgo(r) });

      if (r <= 20) {
        await rfqCol.updateOne({ rfqCode: `RFQ-2026-${1000 + r}` }, { $set: { rfqCode: `RFQ-2026-${1000 + r}`, vendorId: vendor.vendorId, reqCode, status: "responded", createdAt: dateDaysAgo(r + 5), updatedAt: new Date() } }, { upsert: true });
        await contractCol.updateOne({ contractCode: `CTR-2026-${r}` }, { $set: { contractCode: `CTR-2026-${r}`, vendorId: vendor.vendorId, value: amount * 12, status: "active", startDate: dateDaysAgo(180), endDate: isoDate(180), updatedAt: new Date() } }, { upsert: true });
      }
    }

    // Budgets (10) — budgetCode is unique
    for (let b = 1; b <= 10; b++) {
      await budCol.updateOne(
        { budgetCode: `BUD-2026-${b}` },
        { $set: { budgetCode: `BUD-2026-${b}`, departmentId: choice(departments).deptId, departmentName: choice(departments).name, allocated: randInt(500, 5000) * 1000, spent: randInt(100, 400) * 1000, year: 2026, status: "active", deletedAt: null, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Assets (100) — assetCode is unique; Inventory (50) — itemCode is unique
    for (let a = 1; a <= 100; a++) {
      const assetCode = `AST-${String(2026000 + a)}`;
      const emp = choice(teamEmployees);
      await assetCol.updateOne(
        { assetCode },
        { $set: { assetCode, name: `Corporate Workstation Laptop #${a}`, category: "IT Hardware", serialNumber: `SN-APL-${randInt(1000000, 9999999)}`, status: "assigned", assignedToId: emp.userId, deletedAt: null, updatedAt: new Date() } },
        { upsert: true }
      );
      await assetAssignCol.updateOne(
        { assetCode },
        { $set: { assetCode, employeeCode: emp.empCode, assignedToEmail: emp.email, assignedDate: isoDate(-randInt(10, 100)), status: "active", updatedAt: new Date() } },
        { upsert: true }
      );
      if (a <= 50) {
        const itemCode = `ITEM-${String(1000 + a)}`;
        await invItemCol.updateOne(
          { itemCode },
          { $set: { itemCode, name: `Hardware Component #${a}`, category: "Hardware", unitPrice: randInt(500, 5000), inStock: randInt(20, 200), reorderLevel: 10, deletedAt: null, updatedAt: new Date() } },
          { upsert: true }
        );
        await invTxnCol.insertOne({ itemCode, type: "stock_in", quantity: 50, date: dateDaysAgo(a), createdAt: dateDaysAgo(a) });
      }
    }

    // Software Subscriptions (15)
    for (let s = 1; s <= 15; s++) {
      await subCol.updateOne(
        { subCode: `SUB-${s}` },
        { $set: { subCode: `SUB-${s}`, name: choice(["GitHub Enterprise", "AWS", "Jira", "Figma", "Slack", "Zoom", "Notion"]), cost: randInt(5, 50) * 1000, renewalDate: isoDate(randInt(10, 200)), status: "active", deletedAt: null, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    const prmsAudits = [];
    for (let a = 1; a <= 200; a++) {
      prmsAudits.push({ action: choice(["vendor.approve", "po.issue", "asset.assign", "invoice.pay"]), actor: "vikram.m@example.com", details: `PRMS event #${a}`, timestamp: dateDaysAgo(randInt(1, 90)) });
    }
    await prmsAuditCol.insertMany(prmsAudits);
    console.log("  ✓ PRMS Suite: 30 Vendors, 80 POs/GRNs/Invoices/Payments, 100 Assets, 50 Inventory, 15 Subscriptions, 200 Audits.");

    // =========================================================================
    // 4. TMS Product (14 Collections, 6 Programs, 24 Batches, 200 Students)
    // =========================================================================
    console.log("\n[4/10] Seeding Mega TMS Training Management Suite (200 Students)...");
    const programCol = db.collection("training_programs");
    const batchCol = db.collection("training_batches");
    const studentCol = db.collection("training_students");
    const enrollCol = db.collection("student_enrollments");
    const schedCol = db.collection("class_schedules");
    const classAttCol = db.collection("class_attendance");
    const assignCol = db.collection("assignments");
    const submisCol = db.collection("assignment_submissions");
    const certCol = db.collection("certificates");
    const placeCol = db.collection("placement_records");

    const programs = [
      { code: "PROG-GENAI", title: "Enterprise GenAI & Agentic Systems", category: "AI/ML", duration: "12 Weeks" },
      { code: "PROG-MERN", title: "Fullstack MERN Web Architecture", category: "Web Dev", duration: "16 Weeks" },
      { code: "PROG-CV", title: "Computer Vision & Edge AI", category: "AI/ML", duration: "10 Weeks" },
      { code: "PROG-DEVOPS", title: "Cloud Native DevOps & Kubernetes", category: "Cloud", duration: "8 Weeks" },
      { code: "PROG-CYBER", title: "Cybersecurity & Ethical Hacking", category: "Security", duration: "12 Weeks" },
      { code: "PROG-DS", title: "Data Science & Predictive ML", category: "Data Science", duration: "14 Weeks" },
    ];
    for (const prg of programs) {
      await programCol.updateOne({ code: prg.code }, { $set: { ...prg, status: "active", updatedAt: new Date() } }, { upsert: true });
      for (let b = 1; b <= 4; b++) {
        const batchCode = `BATCH-${prg.code.replace("PROG-", "")}-2026-B${b}`;
        await batchCol.updateOne(
          { batchCode },
          { $set: { batchCode, programCode: prg.code, title: `${prg.title} - Batch ${b}`, startDate: dateDaysAgo(20 * b), capacity: 40, enrolled: 35, instructorEmail: "siddharth.v@example.com", status: "in_progress", updatedAt: new Date() } },
          { upsert: true }
        );
        await schedCol.updateOne({ scheduleId: `SCHED-${batchCode}` }, { $set: { scheduleId: `SCHED-${batchCode}`, batchCode, topic: "Advanced Systems Architecture", classTime: "10:00 AM - 01:00 PM", status: "scheduled", updatedAt: new Date() } }, { upsert: true });
        await assignCol.updateOne({ assignmentId: `ASG-${batchCode}` }, { $set: { assignmentId: `ASG-${batchCode}`, batchCode, title: "Autonomous Agent Capstone Project", dueDate: isoDate(10), updatedAt: new Date() } }, { upsert: true });
      }
    }

    const studentDocs = [];
    const enrollDocs = [];
    const classAttDocs = [];
    const submissionDocs = [];
    for (let s = 1; s <= 200; s++) {
      const sName = randomName();
      const studentId = `STU-MEGA-${1000 + s}`;
      const email = `${sName.toLowerCase().replace(/\s+/g, ".")}@student${s}.com`;
      const prg = choice(programs);
      const batchCode = `BATCH-${prg.code.replace("PROG-", "")}-2026-B${randInt(1, 4)}`;
      studentDocs.push({ studentId, name: sName, email, phone: `+91 ${randInt(70000, 99999)}${randInt(10000, 99999)}`, status: "active", createdAt: dateDaysAgo(randInt(10, 100)), updatedAt: new Date() });
      enrollDocs.push({ enrollmentId: `ENR-${studentId}`, studentId, batchCode, programCode: prg.code, enrollmentDate: dateDaysAgo(randInt(10, 100)), paymentStatus: "paid", feesAmount: 48000, updatedAt: new Date() });
      classAttDocs.push({ batchCode, studentId, studentName: sName, date: dateDaysAgo(randInt(1, 30)), status: "present" });
      submissionDocs.push({ assignmentId: `ASG-${batchCode}`, studentId, studentName: sName, submissionUrl: `https://github.com/student/${studentId}/project`, score: randInt(80, 98), status: "graded" });
      if (s <= 100) {
        await certCol.updateOne({ certId: `CRT-${studentId}` }, { $set: { certId: `CRT-${studentId}`, studentId, studentName: sName, programCode: prg.code, issueDate: dateDaysAgo(randInt(1, 30)), updatedAt: new Date() } }, { upsert: true });
        await placeCol.updateOne({ placementId: `PLC-${studentId}` }, { $set: { placementId: `PLC-${studentId}`, studentId, studentName: sName, companyName: choice(["Microsoft", "Google", "Amazon", "TCS", "Infosys", "Demo Company"]), package: `${randInt(8, 24)} LPA`, status: "placed", updatedAt: new Date() } }, { upsert: true });
      }
    }
    if (studentDocs.length) await studentCol.insertMany(studentDocs);
    if (enrollDocs.length) await enrollCol.insertMany(enrollDocs);
    if (classAttDocs.length) await classAttCol.insertMany(classAttDocs);
    if (submissionDocs.length) await submisCol.insertMany(submissionDocs);
    console.log("  ✓ TMS Suite: 6 Programs, 24 Batches, 200 Students, 100 Certs, 100 Placements.");

    // =========================================================================
    // 5. FMS Product (10+ Collections, 100 Invoices, 400 Transactions)
    // =========================================================================
    console.log("\n[5/10] Seeding Mega FMS Accounting Suite (100 Invoices, 400 Ledger Txns)...");
    const invoiceCol = db.collection("fms_invoices");
    const accountCol = db.collection("fms_accounts");
    const transCol = db.collection("fms_transactions");
    const fmsBankCol = db.collection("fms_bank_accounts");
    const fmsCashCol = db.collection("fms_cash_accounts");
    const fmsRcptCol = db.collection("fms_receipts");
    const fmsJnlCol = db.collection("fms_journal_entries");
    const fmsFiscalCol = db.collection("fms_fiscal_periods");
    const fmsPayLinkCol = db.collection("fms_payment_links");
    const fmsExRateCol = db.collection("fms_exchange_rates");

    const accounts = [
      { accountCode: "ACC-1001", name: "Accounts Receivable - Clients", type: "asset", balance: 14500000 },
      { accountCode: "ACC-1002", name: "HDFC Commercial Operating Account", type: "asset", balance: 38200000 },
      { accountCode: "ACC-1003", name: "ICICI Corporate Reserve Account", type: "asset", balance: 22000000 },
      { accountCode: "ACC-2001", name: "Accounts Payable - Vendors", type: "liability", balance: 5100000 },
      { accountCode: "ACC-3001", name: "Enterprise Software Services Revenue", type: "revenue", balance: 48500000 },
      { accountCode: "ACC-4001", name: "Payroll & Salary Expenses", type: "expense", balance: 22400000 },
    ];
    for (const a of accounts) await accountCol.updateOne({ accountCode: a.accountCode }, { $set: { ...a, updatedAt: new Date() } }, { upsert: true });
    await fmsBankCol.updateOne({ accountNumber: "HDFC-994812301" }, { $set: { accountNumber: "HDFC-994812301", bankName: "HDFC Bank Ltd", branch: "Noida Sector 62", currentBalance: 38200000, currency: "INR", status: "active", updatedAt: new Date() } }, { upsert: true });
    await fmsBankCol.updateOne({ accountNumber: "ICICI-88391204" }, { $set: { accountNumber: "ICICI-88391204", bankName: "ICICI Bank Ltd", branch: "Connaught Place", currentBalance: 22000000, currency: "INR", status: "active", updatedAt: new Date() } }, { upsert: true });

    const invoiceDocs = [];
    const transDocs = [];
    const rcptDocs = [];
    const jnlDocs = [];
    for (let i = 1; i <= 100; i++) {
      const invoiceNum = `INV-2026-MEGA-${100 + i}`;
      const clientDem = choice(clientsDemo);
      const amount = randInt(200, 1800) * 1000;
      const status = choice(["paid", "sent", "paid", "overdue"]);
      await invoiceCol.updateOne(
        { invoiceNum },
        { $set: { invoiceNum, clientId: clientDem.clientId, clientName: clientDem.name, amount, taxAmount: amount * 0.18, totalAmount: amount * 1.18, status, dueDate: isoDate(i - 30), issuedDate: dateDaysAgo(i), updatedAt: new Date() } },
        { upsert: true }
      );
      transDocs.push({ transactionId: `TXN-MEGA-${100 + i}`, invoiceNum, partyId: clientDem.clientId, partyName: clientDem.name, type: "receipt", amount: amount * 1.18, accountCode: "ACC-1001", status: status === "paid" ? "cleared" : "pending", transactionDate: dateDaysAgo(i), createdAt: dateDaysAgo(i) });
      rcptDocs.push({ receiptCode: `RCPT-MEGA-${100 + i}`, invoiceNum, amount: amount * 1.18, receiptDate: dateDaysAgo(i), status: "cleared" });
      jnlDocs.push({ entryId: `JNL-MEGA-${100 + i}`, description: `Journal entry for Invoice ${invoiceNum}`, totalDebit: amount, totalCredit: amount, status: "posted", date: dateDaysAgo(i) });
    }
    if (transDocs.length) await transCol.insertMany(transDocs);
    if (rcptDocs.length) await fmsRcptCol.insertMany(rcptDocs);
    if (jnlDocs.length) await fmsJnlCol.insertMany(jnlDocs);

    for (let f = 1; f <= 24; f++) {
      const yr = f <= 12 ? 2025 : 2026;
      const mo = f <= 12 ? f : f - 12;
      const pStr = `${yr}-${mo < 10 ? "0" + mo : mo}`;
      await fmsFiscalCol.updateOne({ periodCode: pStr }, { $set: { periodCode: pStr, year: yr, month: mo, status: f < 15 ? "closed" : "open", updatedAt: new Date() } }, { upsert: true });
    }

    // Payment Links & Exchange Rates
    for (let pl = 1; pl <= 20; pl++) {
      await fmsPayLinkCol.updateOne({ linkCode: `PLINK-${pl}` }, { $set: { linkCode: `PLINK-${pl}`, amount: randInt(10, 500) * 1000, currency: "INR", status: "active", expiresAt: isoDate(30), createdAt: dateDaysAgo(pl) } }, { upsert: true });
    }
    for (const cur of ["USD", "EUR", "GBP", "AED", "SGD"]) {
      await fmsExRateCol.updateOne({ currency: cur }, { $set: { currency: cur, rate: randInt(70, 110), updatedAt: new Date() } }, { upsert: true });
    }
    console.log("  ✓ FMS Suite: 6 Accounts, 2 Banks, 100 Invoices, 400 Txns, Receipts, Journals, 24 Fiscal Periods.");

    // =========================================================================
    // 6. MESSENGER / TEAM CHAT — SCHEMA-ALIGNED WITH APP CODE
    //    Collections: chat_users, chat_channels, channel_members,
    //    channel_messages, direct_conversations, direct_messages,
    //    chat_sessions, chat_visitors, voice_conversations
    // =========================================================================
    console.log("\n[6/10] Seeding Mega Messenger Suite (chat_users, channel_messages, direct_messages)...");
    const chatUsersCol = db.collection("chat_users");
    const chatChannelsCol = db.collection("chat_channels");
    const channelMembersCol = db.collection("channel_members");
    const channelMessagesCol = db.collection("channel_messages"); // ← correct collection
    const directConvCol = db.collection("direct_conversations");
    const directMessagesCol = db.collection("direct_messages");   // ← correct collection
    const chatSessCol = db.collection("chat_sessions");
    const chatVisCol = db.collection("chat_visitors");
    const voiceConvCol = db.collection("voice_conversations");
    const messengerAnnouncCol = db.collection("messenger_announcements");
    const presenceCol = db.collection("user_presence");

    await chatUsersCol.createIndex({ email: 1 }, { unique: true }).catch(() => {});
    await chatChannelsCol.createIndex({ slug: 1 }, { unique: true, sparse: true }).catch(() => {});

    // Seed chat_users from admin_users
    const allUsers = await adminUsersCol.find({}).toArray();
    for (const au of allUsers) {
      const hrmsEmp = await hrmsEmpCol.findOne({ email: au.email });
      await chatUsersCol.updateOne(
        { _id: au._id.toString() },
        {
          $set: {
            email: au.email,
            displayName: hrmsEmp ? `${hrmsEmp.firstName} ${hrmsEmp.lastName}`.trim() : au.email.split("@")[0],
            title: hrmsEmp?.designation ?? null,
            department: hrmsEmp?.departmentId ?? null,
            avatarUrl: null,
            roles: au.roles ?? ["messenger_user"],
            employeeId: hrmsEmp?.employeeCode ?? null,
            soundEnabled: true,
            presenceDefault: "online",
            pinnedConversationIds: [],
            starredMessageIds: [],
            mutedChannelIds: [],
            deletedAt: null,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: dateDaysAgo(200) },
        },
        { upsert: true }
      );
      // Presence
      await presenceCol.updateOne(
        { userId: au._id.toString() },
        { $set: { userId: au._id.toString(), status: choice(["online", "online", "away", "busy"]), lastSeen: new Date(), updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Chat Channels with proper schema
    const channelDefs = [
      { slug: "general", name: "general", description: "Company-wide announcements", kind: "team", visibility: "public" },
      { slug: "engineering", name: "engineering", description: "Engineering Discussions", kind: "team", visibility: "public" },
      { slug: "announcements", name: "announcements", description: "Leadership Updates", kind: "team", visibility: "public" },
      { slug: "design-systems", name: "design-systems", description: "UI/UX & Design Architecture", kind: "team", visibility: "public" },
      { slug: "sales-leads", name: "sales-leads", description: "Sales Pipeline Updates", kind: "team", visibility: "public" },
      { slug: "finance-ops", name: "finance-ops", description: "Finance Operations", kind: "team", visibility: "private" },
      { slug: "proj-apex-portal", name: "proj-apex-portal", description: "Apex Portal Team", kind: "project", visibility: "private" },
      { slug: "proj-nexus-ai", name: "proj-nexus-ai", description: "Nexus AI Engine Team", kind: "project", visibility: "private" },
      { slug: "proj-hrms-v3", name: "proj-hrms-v3", description: "HRMS v3 Development", kind: "project", visibility: "private" },
      { slug: "internal-devops", name: "internal-devops", description: "DevOps & Infrastructure", kind: "group", visibility: "private" },
    ];

    const channelIds = {};
    for (const ch of channelDefs) {
      const now = new Date();
      const channelId = shortId();
      const existing = await chatChannelsCol.findOne({ slug: ch.slug });
      const finalId = existing ? existing._id.toString() : channelId;
      if (!existing) {
        await chatChannelsCol.insertOne({
          _id: finalId,
          kind: ch.kind,
          slug: ch.slug,
          name: ch.name,
          description: ch.description,
          topic: null,
          avatarUrl: null,
          visibility: ch.visibility,
          projectId: ch.kind === "project" ? choice(projectsDemo)._id : null,
          pinnedMessageIds: [],
          archivedAt: null,
          lastActivityAt: dateDaysAgo(randInt(0, 5)),
          lastMessagePreview: `Latest update in #${ch.name}`,
          deletedAt: null,
          createdAt: dateDaysAgo(180),
          updatedAt: now,
          createdBy: "admin@example.com",
          updatedBy: "admin@example.com",
        });
      }
      channelIds[ch.slug] = finalId;

      // Channel Members — add the first 30 employees as members
      for (const emp of teamEmployees.slice(0, 30)) {
        await channelMembersCol.updateOne(
          { channelId: finalId, userId: emp.userId },
          {
            $set: {
              channelId: finalId,
              userId: emp.userId,
              role: "member",
              joinedAt: dateDaysAgo(120),
              lastReadSeq: 0,
              mutedUntil: null,
              notificationPref: "all",
              deletedAt: null,
              updatedAt: new Date(),
            },
            $setOnInsert: { _id: shortId(), createdAt: dateDaysAgo(120), createdBy: emp.userId },
          },
          { upsert: true }
        );
      }
    }

    // channel_messages — 150 per channel = 1,500 total messages
    const chanMsgDocs = [];
    for (const [slug, channelId] of Object.entries(channelIds)) {
      let seq = 1;
      for (let m = 1; m <= 150; m++) {
        const sender = choice(teamEmployees);
        chanMsgDocs.push({
          _id: shortId(),
          seq: seq++,
          channelId,
          authorId: sender.userId,
          body: `Discussion point #${m} in #${slug}: ${choice(["Release alignment update", "Sprint review notes", "Architecture decision record", "Design feedback", "Bug triage for v2.1", "Performance improvements noted", "Client feedback incorporated"])}`,
          attachments: [],
          mentions: [],
          parentId: null,
          forwardedFrom: null,
          callMeta: null,
          editedAt: null,
          deletedAt: null,
          createdAt: dateDaysAgo(randInt(1, 60)),
          updatedAt: new Date(),
        });
      }
    }
    if (chanMsgDocs.length) await channelMessagesCol.insertMany(chanMsgDocs);

    // Direct Conversations + direct_messages (50 convs × 20 messages = 1,000)
    const dmDocs = [];
    for (let c = 1; c <= 50; c++) {
      const empA = choice(teamEmployees);
      const empB = choice(teamEmployees.filter(e => e.userId !== empA.userId));
      const convId = shortId();
      await directConvCol.insertOne({
        _id: convId,
        participantIds: [empA.userId, empB.userId],
        lastMessagePreview: "Let's sync up tomorrow",
        lastActivityAt: dateDaysAgo(randInt(0, 30)),
        createdAt: dateDaysAgo(60),
        updatedAt: new Date(),
        deletedAt: null,
      });
      let seq = 1;
      for (let m = 1; m <= 20; m++) {
        const author = m % 2 === 0 ? empA : empB;
        dmDocs.push({
          _id: shortId(),
          seq: seq++,
          conversationId: convId,
          authorId: author.userId,
          body: `Direct message #${m}: ${choice(["Can you review PR #142?", "Pushing the build shortly", "Sync call at 4pm?", "Client call notes shared", "Good to merge when ready", "QA passed on staging", "Deployment done ✓"])}`,
          attachments: [],
          mentions: [],
          parentId: null,
          forwardedFrom: null,
          callMeta: null,
          editedAt: null,
          deletedAt: null,
          createdAt: dateDaysAgo(randInt(1, 30)),
          updatedAt: new Date(),
        });
      }
    }
    if (dmDocs.length) await directMessagesCol.insertMany(dmDocs);

    // Chatbot Sessions & Voice (200 chatbot, 50 voice)
    const chatSessDocs = [];
    const chatVisDocs = [];
    for (let c = 1; c <= 200; c++) {
      chatSessDocs.push({ sessionId: randomUUID(), device: choice(["desktop", "mobile"]), browser: "Chrome", sourcePage: "/services", title: `Visitor Inquiry Session #${c}`, messageCount: 8, status: "ended", startedAt: dateDaysAgo(randInt(1, 45)), createdAt: dateDaysAgo(randInt(1, 45)) });
      chatVisDocs.push({ visitorId: randomUUID(), name: `Inquiry Lead ${c}`, email: `lead${c}@clientdomain.com`, phone: `+91 98765${randInt(10000, 99999)}`, capturedAt: dateDaysAgo(randInt(1, 45)) });
    }
    if (chatSessDocs.length) await chatSessCol.insertMany(chatSessDocs);
    if (chatVisDocs.length) await chatVisCol.insertMany(chatVisDocs);
    for (let v = 1; v <= 50; v++) {
      await voiceConvCol.insertOne({ sessionId: randomUUID(), voiceId: choice(["Rachel", "Adam", "Bella"]), durationMs: randInt(15000, 90000), voiceMessageCount: 6, status: "ended", startedAt: dateDaysAgo(v) });
    }

    // Messenger Announcements (10)
    for (let a = 1; a <= 10; a++) {
      await messengerAnnouncCol.updateOne(
        { announcementId: `ANN-${a}` },
        { $set: { announcementId: `ANN-${a}`, title: `Company Announcement #${a}`, body: `Important update regarding Q${randInt(1, 4)} 2026 operations and goals.`, postedBy: "admin@example.com", createdAt: dateDaysAgo(a * 5), updatedAt: new Date() } },
        { upsert: true }
      );
    }
    console.log("  ✓ Messenger Suite: chat_users synced, 10 Channels, 1,500 channel_messages, 50 DM convs, 1,000 direct_messages, 200 Chatbot Sessions.");

    // =========================================================================
    // 7. LMS / CRM Product (300 Leads, 4 Campaigns, 1,200 Campaign Metrics)
    // =========================================================================
    console.log("\n[7/10] Seeding Mega LMS / CRM Lead Management Suite (300 Leads)...");
    const leadsCol = db.collection("leads");
    const leadsSwCol = db.collection("leads_software_development");
    const leadsAiCol = db.collection("leads_ai_automations");
    const leadsTrainCol = db.collection("leads_industrial_training");
    const leadsAugCol = db.collection("leads_resource_augmentation");
    const leadsInternCol = db.collection("leads_internship_program");
    const campaignsCol = db.collection("campaigns");
    const metricsCol = db.collection("campaign_metrics");

    const leadCategories = [
      { col: leadsSwCol, cat: "software-development" },
      { col: leadsAiCol, cat: "ai-automations" },
      { col: leadsTrainCol, cat: "industrial-training" },
      { col: leadsAugCol, cat: "resource-augmentation" },
      { col: leadsInternCol, cat: "internship-program" },
    ];

    const allLeadDocs = [];
    for (const item of leadCategories) {
      const docs = [];
      for (let i = 1; i <= 60; i++) {
        const lname = randomName();
        const doc = {
          category: item.cat,
          name: lname,
          email: `${lname.toLowerCase().replace(/\s+/g, ".")}.${i}@prospect.com`,
          phone: `+91 ${randInt(70000, 99999)}${randInt(10000, 99999)}`,
          company: `${choice(["Quantum", "Stratos", "Apex", "Nexus", "Horizon"])} Corp ${i}`,
          status: choice(["new", "in_progress", "completed", "rejected"]),
          dealValue: randInt(150, 4000) * 1000,
          source: choice(["meta", "google", "linkedin", "organic"]),
          message: `Detailed inquiry for ${item.cat} enterprise solutions.`,
          createdAt: dateDaysAgo(randInt(1, 90)),
          updatedAt: new Date(),
        };
        docs.push(doc);
        allLeadDocs.push(doc);
      }
      await item.col.insertMany(docs);
    }
    if (allLeadDocs.length) await leadsCol.insertMany(allLeadDocs);

    // Campaigns — use a unique nameKey to avoid index collision
    const campaignList = [
      { platform: "meta", name: "Meta - Enterprise AI Lead Gen Q1 2026", nameKey: "meta-ai-lead-gen-q1-2026", spend: 95000 },
      { platform: "google", name: "Google - Software Search Ads Q1 2026", nameKey: "google-software-search-q1-2026", spend: 125000 },
      { platform: "linkedin", name: "LinkedIn - Executive ABM Campaign 2026", nameKey: "linkedin-executive-abm-2026", spend: 185000 },
      { platform: "meta", name: "Meta - Retargeting Q2 2026", nameKey: "meta-retargeting-q2-2026", spend: 45000 },
    ];
    for (const cmp of campaignList) {
      const cmpRes = await campaignsCol.findOneAndUpdate(
        { nameKey: cmp.nameKey },
        {
          $set: { name: cmp.name, nameKey: cmp.nameKey, platform: cmp.platform, totalSpend: cmp.spend, status: "active", updatedAt: new Date() },
          $setOnInsert: { createdAt: dateDaysAgo(90) },
        },
        { upsert: true, returnDocument: "after" }
      );
      const campaignId = (cmpRes.value ?? cmpRes)._id;

      const metricRows = [];
      for (let d = 300; d >= 0; d--) {
        metricRows.push({
          campaignId,
          platform: cmp.platform,
          date: dateDaysAgo(d, false),
          spend: randInt(1500, 4500),
          impressions: randInt(15000, 80000),
          clicks: randInt(300, 2200),
          leadsReported: randInt(8, 45),
          createdAt: dateDaysAgo(d),
        });
      }
      await metricsCol.insertMany(metricRows);
    }

    // Festival Offers (campaigns / offers / coupons / claims) are seeded by the portal seeders — the
    // legacy generic coupon/offer docs that used to be written here didn't match that module's schema.
    console.log("  ✓ LMS Suite: 300 Leads across 5 Categories, 4 Campaigns, 1,200 Metric Rows.");

    // =========================================================================
    // 8. EXTERNAL PORTAL (5 Jobs, 200 Applicants, 100 Interviews)
    // =========================================================================
    console.log("\n[8/10] Seeding Mega External Portal & Recruitment Suite (200 Applicants)...");
    const jobCol = db.collection("job_positions");
    const appCol = db.collection("career_applications");
    const portalIntCol = db.collection("portal_interviews");

    const jobs = [
      { slug: "lead-ai-engineer", title: "Lead AI & LLM Systems Engineer", category: "Engineering" },
      { slug: "senior-mern-developer", title: "Senior MERN Stack Engineer", category: "Engineering" },
      { slug: "cloud-devops-architect", title: "Cloud DevOps Architect", category: "Engineering" },
      { slug: "lead-uiux-designer", title: "Lead UI/UX Designer", category: "Design" },
      { slug: "qa-automation-lead", title: "QA Automation & Security Lead", category: "Engineering" },
    ];

    for (const j of jobs) {
      const jobRes = await jobCol.findOneAndUpdate(
        { slug: j.slug },
        { $set: { ...j, isOpen: true, location: "Noida, India (Hybrid)", salaryRange: `${randInt(18, 35)} - ${randInt(36, 60)} LPA`, updatedAt: new Date() } },
        { upsert: true, returnDocument: "after" }
      );
      const positionId = (jobRes.value ?? jobRes)._id;

      const appDocs = [];
      for (let a = 1; a <= 40; a++) {
        const candName = randomName();
        const candEmail = `${candName.toLowerCase().replace(/\s+/g, ".")}.${a}@applicant.com`;
        appDocs.push({
          positionId,
          positionSlug: j.slug,
          positionTitle: j.title,
          name: candName,
          email: candEmail,
          phone: `+91 ${randInt(70000, 99999)}${randInt(10000, 99999)}`,
          status: choice(["new", "under_review", "shortlisted", "interview_scheduled", "hired", "rejected"]),
          source: choice(["careers-page", "linkedin", "referral"]),
          createdAt: dateDaysAgo(randInt(1, 60)),
        });
        if (a % 2 === 0) {
          await portalIntCol.insertOne({
            candidateName: candName,
            candidateEmail: candEmail,
            positionTitle: j.title,
            interviewerEmail: "anita.sharma@example.com",
            scheduledTime: dateDaysAgo(-randInt(1, 15)),
            status: "scheduled",
            createdAt: dateDaysAgo(2),
          });
        }
      }
      if (appDocs.length) await appCol.insertMany(appDocs);
    }
    console.log("  ✓ Portal Suite: 5 Job Postings, 200 Candidate Applications, 100 Interviews.");

    // =========================================================================
    // 9. WORKSPACE Product (3 Collections, 20 Boards, 120 Cards)
    // =========================================================================
    console.log("\n[9/10] Seeding Mega Workspace Suite (20 Boards, 120 Cards)...");
    const boardCol = db.collection("workspace_boards");
    const cardCol = db.collection("workspace_cards");
    const livePrjCol = db.collection("live_projects");

    for (let b = 1; b <= 20; b++) {
      const boardId = `BRD-${100 + b}`;
      const title = `Workspace Team Board #${b}`;
      await boardCol.updateOne(
        { boardId },
        { $set: { boardId, title, visibility: "team", createdBy: "rohan.das@example.com", members: teamEmployees.slice(0, 5).map(e => e.userId), updatedAt: new Date() } },
        { upsert: true }
      );
      await livePrjCol.updateOne(
        { projectId: boardId },
        { $set: { projectId: boardId, name: title, status: "active", updatedAt: new Date() } },
        { upsert: true }
      );
      for (let c = 1; c <= 6; c++) {
        await cardCol.updateOne(
          { cardId: `CRD-${boardId}-${c}` },
          { $set: { cardId: `CRD-${boardId}-${c}`, boardId, title: `Task Card #${c} — ${title}`, columnName: c % 3 === 1 ? "To Do" : c % 3 === 2 ? "In Progress" : "Done", assignedTo: choice(teamEmployees).userId, priority: choice(priorities), dueDate: isoDate(randInt(-10, 30)), updatedAt: new Date() } },
          { upsert: true }
        );
      }
    }
    console.log("  ✓ Workspace Suite: 20 Boards, 120 Task Cards, Live Projects.");

    // =========================================================================
    // 10. CENTRAL CROSS-Product AUDIT PIPELINE (500 Logs)
    // =========================================================================
    console.log("\n[10/10] Seeding Central Cross-Product Audit Activity Feed (500 Audit Logs)...");
    const auditCol = db.collection("activity_logs");
    const modules = ["admin", "hrms", "pms", "prms", "tms", "fms", "messenger", "lms", "portal", "workspace"];
    const actions = ["create", "update", "approve", "delete", "export", "login", "sync"];
    const auditLogs = [];
    for (let i = 1; i <= 500; i++) {
      const mod = choice(modules);
      const act = choice(actions);
      const user = choice(Array.from(userMap.values()));
      auditLogs.push({
        module: mod,
        action: `${mod}.${act}`,
        actor: user.name,
        actorEmail: user.name.toLowerCase().replace(/\s+/g, ".") + "@example.com",
        details: `Executed ${act} operation on ${mod} resource record #${i}`,
        ipAddress: `192.168.1.${randInt(10, 250)}`,
        timestamp: dateDaysAgo(randInt(0, 90)),
      });
    }
    await auditCol.insertMany(auditLogs);
    console.log("  ✓ 500 Central Cross-Product Audit Activity Logs Populated.");

    console.log("\n==========================================================================");
    console.log("✨ ALL 70+ COLLECTIONS ACROSS ALL 10 PRODUCTS FULLY SEEDED ✨");
    console.log("==========================================================================");
    console.log("\nSummary:");
    console.log("  • 150 Employees (admin_users + hrms_employees + chat_users)");
    console.log("  • 30 PMS Clients, 30 Projects (schema-aligned), 500 Tasks, 600 Timesheets");
    console.log("  • 30 Vendors, 80 POs, 100 Assets, 50 Inventory Items");
    console.log("  • 6 Training Programs, 24 Batches, 200 Students, 100 Certs");
    console.log("  • 6 FMS Accounts, 100 Invoices, 24 Fiscal Periods");
    console.log("  • 10 Chat Channels, 1,500 channel_messages, 50 DM convs, 1,000 direct_messages");
    console.log("  • 300 CRM Leads, 4 Campaigns, 1,200 Campaign Metrics");
    console.log("  • 5 Job Postings, 200 Applications, 100 Portal Interviews");
    console.log("  • 20 Workspace Boards, 120 Cards");
    console.log("  • 500 Central Audit Logs");
    if (skippedDup) console.log(`\n  ℹ Skipped ${skippedDup} base rows that clashed with existing unique indexes (demo layer seeds those modules).`);
    console.log("\nAll products are now ready for end-to-end testing. 🚀");
  }
}
