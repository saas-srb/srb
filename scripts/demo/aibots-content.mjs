// Demo content for the AI Bots seeder: each bot's knowledge documents and a set of realistic chats.
// Everything here is fictional demo material about Demo Company — clients, numbers and case studies are illustrative only.

const DOC = (title, category, description, body) => ({ title, category, description, filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`, body });

const COMPANY_PROFILE = DOC(
  "Company Profile",
  "Company Profile",
  "Who Demo Company is, what it does and how it works (demo).",
  `# Demo Company — Company Profile (demo)

Demo Company Pvt Ltd is a software development company that designs, builds and scales web, mobile and AI/ML products for growing businesses — from MVPs to production-grade systems.

## At a glance
- Founded: 2019 · Headquarters: Bengaluru, India
- Team: 60+ engineers, designers, analysts and QA
- Delivery model: dedicated pods (PM + BA + 3–6 engineers + QA), fixed-scope projects, or staff augmentation
- Industries: healthcare, logistics, fintech, education, retail, real estate

## What makes us different
1. Discovery first — every engagement starts with a 1–2 week paid discovery that produces a BRD, clickable prototype and estimate.
2. Weekly demos and a shared board — clients see progress every week.
3. AI where it pays off — we add AI features (search, summarisation, forecasting, chat assistants) only when they have a measurable business case.
4. Post-launch care — 90 days of warranty support on every fixed-scope project.

## Certifications & practices
ISO 27001-aligned security practices, GDPR-aware data handling, code reviews on every change, automated CI/CD and test coverage targets agreed per project.`
);

const SERVICES = DOC(
  "Services Catalogue",
  "Services",
  "Service lines, typical deliverables and timelines (demo).",
  `# Services Catalogue (demo)

| Service | Typical deliverables | Typical timeline |
|---|---|---|
| Web application development | Responsive web app, admin product, API, CI/CD | 10–16 weeks |
| Mobile app development | iOS + Android (React Native or Flutter), store release | 12–18 weeks |
| AI/ML solutions | Model or LLM feature, evaluation report, monitoring | 6–12 weeks |
| AI chat assistants | Knowledge-grounded assistant, admin console, analytics | 4–8 weeks |
| UI/UX design | Research, wireframes, design system, prototype | 3–6 weeks |
| Cloud & DevOps | Infrastructure as code, monitoring, cost optimisation | 2–6 weeks |
| Dedicated team | Pod of 4–8 people, monthly billing | 3+ months |

## Standard phases
Discovery → Design → Build (2-week sprints) → UAT → Launch → 90-day warranty.`
);

const CASE_STUDIES = DOC(
  "Case Studies",
  "Case Studies",
  "Three short case studies with outcomes (demo).",
  `# Case Studies (demo)

## 1. MedBook — healthcare appointment platform
- Client: a 40-clinic outpatient chain
- Built: patient app (iOS/Android), clinic web console, WhatsApp reminders, online payments
- Timeline: 16 weeks, pod of 6
- Outcome: no-shows down 31%, front-desk calls down 45% in the first quarter

## 2. RouteWise — logistics dispatch and tracking
- Client: regional logistics company, 300 vehicles
- Built: dispatcher dashboard, driver app with offline mode, live tracking, proof of delivery
- Timeline: 14 weeks
- Outcome: 18% more deliveries per vehicle per day; billing disputes down 60%

## 3. LendLite — fintech loan origination
- Client: NBFC processing 5,000 applications/month
- Built: application portal, document OCR, rules engine, underwriting dashboard
- Timeline: 20 weeks
- Outcome: time-to-decision cut from 3 days to 4 hours`
);

const PRICING = DOC(
  "Pricing Guide",
  "Pricing",
  "Rate card and estimation rules for proposals (demo).",
  `# Pricing Guide (demo — internal)

## Rate card (USD per hour)
| Role | Rate |
|---|---|
| Project manager | 38 |
| Business analyst | 34 |
| Senior engineer | 40 |
| Engineer | 30 |
| UI/UX designer | 32 |
| QA engineer | 24 |

## Package starting prices
- Discovery sprint (2 weeks): USD 4,500
- MVP web app: from USD 25,000
- Mobile app (iOS + Android): from USD 35,000
- AI chat assistant: from USD 12,000
- Dedicated pod: from USD 14,000 / month

## Rules
- Add 15% contingency to fixed-scope estimates.
- Payment milestones: 30% on signing, 40% on UAT start, 30% on go-live.
- Never quote below the package starting price without approval from a director.`
);

const BRD_TEMPLATE = DOC(
  "BRD Template",
  "Templates",
  "The standard Business Requirements Document structure (demo).",
  `# Business Requirements Document — Template (demo)

1. Document control (version, author, reviewers, date)
2. Background and problem statement
3. Business objectives (measurable, with target and date)
4. Scope — in scope / out of scope
5. Stakeholders and user personas
6. Business requirements — numbered BR-01, BR-02…; each with priority (Must/Should/Could) and acceptance criteria
7. Business rules — numbered RULE-01…
8. Assumptions
9. Constraints (budget, timeline, regulatory, technical)
10. Dependencies and risks
11. Success metrics
12. Glossary and sign-off`
);

const REQ_GUIDELINES = DOC(
  "Requirement Writing Guidelines",
  "Guidelines",
  "How good requirements are written and reviewed (demo).",
  `# Requirement Writing Guidelines (demo)

A good requirement is: necessary, unambiguous, testable, feasible, traceable and independent.

## Red flags to call out in a review
- Vague words: "fast", "user-friendly", "etc.", "as appropriate", "support", "handle"
- Missing actor ("the system should notify" — notify whom, through which channel?)
- Missing numbers: response time, volume, limits, retention period
- Compound requirements joined by "and/or"
- No acceptance criteria
- No non-functional requirements: security, performance, availability, accessibility, audit

## Non-functional checklist
Performance · Scalability · Availability · Security & roles · Data retention · Audit trail · Accessibility (WCAG 2.1 AA) · Localisation · Browser/device support · Backup & recovery`
);

const BUSINESS_RULES = DOC(
  "Business Rules Library",
  "Business Rules",
  "Common reusable business rules (demo).",
  `# Business Rules Library (demo)

- RULE-AUTH-01: Accounts lock for 15 minutes after 5 failed sign-in attempts.
- RULE-AUTH-02: Passwords are at least 10 characters.
- RULE-PAY-01: Refunds are allowed within 7 days of payment and only to the original payment method.
- RULE-NOTIF-01: Reminders are not sent between 21:00 and 08:00 local time.
- RULE-DATA-01: Personal data is deleted 30 days after an account-deletion request.
- RULE-APPT-01: Appointments can be cancelled free of charge up to 4 hours before the slot.`
);

const DISCOVERY_QUESTIONS = DOC(
  "Discovery Question Bank",
  "Guidelines",
  "Questions to use on discovery calls, by topic (demo).",
  `# Discovery Question Bank (demo)

## Business context
- What triggered this project now? What happens if you do nothing for 6 months?
- How will you measure success one year after launch?

## Users & process
- Who are the users, and how many of each type?
- Walk me through how this works today, step by step. Where does it break?

## Scope & priorities
- If we could only ship three things first, which three?
- What is explicitly out of scope?

## Constraints
- Target launch date — and what drives it?
- Budget range we should design within?
- Systems we must integrate with? Who owns them?

## Decision process
- Who signs off on the proposal? Who else influences the decision?
- Are you speaking to other vendors?`
);

const MINUTES_TEMPLATE = DOC(
  "Meeting Minutes Template",
  "Templates",
  "House style for meeting minutes (demo).",
  `# Meeting Minutes — House Style (demo)

- Title, date, duration
- Attendees (name — role)
- Agenda
- Key discussion points (bullets, one line each)
- Decisions (numbered D1, D2…)
- Action items — table: # · action · owner · due date (TBD if not agreed)
- Open questions / parking lot
- Next meeting`
);

const SOW_TEMPLATE = DOC(
  "SOW Template",
  "Templates",
  "Statement of Work structure (demo).",
  `# Statement of Work — Template (demo)

1. Parties and effective date
2. Project overview
3. Scope of work (in scope / out of scope)
4. Deliverables and acceptance criteria
5. Milestones and timeline
6. Roles and responsibilities (Demo Company / client)
7. Assumptions and dependencies
8. Change control process
9. Commercials and payment milestones
10. Warranty (90 days) and support
11. Sign-off`
);

/** Knowledge base per bot key (matches `BOTS[].key` in aibots.mjs). */
export const KNOWLEDGE = {
  proposal: [COMPANY_PROFILE, SERVICES, CASE_STUDIES, PRICING],
  requirements: [BRD_TEMPLATE, REQ_GUIDELINES, BUSINESS_RULES],
  brd: [BRD_TEMPLATE, BUSINESS_RULES],
  discovery: [DISCOVERY_QUESTIONS, SERVICES],
  meeting: [MINUTES_TEMPLATE],
  sow: [SOW_TEMPLATE, PRICING],
};

// ---------------------------------------------------------------------------
// Chats. `bot` is a bot key or "general"; `user` is the demo account's local part
// (admin / manager / user / limited). Each turn is [user message, assistant reply].
// Only chats the account is actually allowed to have are listed (ProposalGPT is
// restricted to sales roles, so "limited" has none).
// ---------------------------------------------------------------------------

export const CHATS = [
  {
    bot: "proposal", user: "user", title: "Client ABC Proposal", days: 2,
    turns: [
      [
        "Draft an executive summary for a proposal to ABC Clinics — they run 25 outpatient clinics and want an appointment booking app with reminders.",
        `## Executive summary — ABC Clinics

ABC Clinics wants to make booking an appointment as easy as sending a message, and to stop losing revenue to missed visits. Demo Company proposes a patient app (iOS and Android), a clinic web console and automated WhatsApp/SMS reminders, delivered in **about 16 weeks** by a dedicated pod.

**Why Demo Company:** we delivered almost exactly this for **MedBook**, a 40-clinic chain, where no-shows fell **31%** and front-desk calls fell **45%** in the first quarter.

**How we'll work:** a 2-week paid discovery sprint (USD 4,500) produces the BRD, a clickable prototype and a fixed estimate, followed by 2-week build sprints with a demo every week and 90 days of warranty support after launch.

Would you like me to draft the scope and commercials next? I'll need the number of doctors and whether online payments are in scope.`,
      ],
      [
        "Yes — online payments are in scope, around 120 doctors. Draft the commercials.",
        `## Commercials (draft)

Based on the pricing guide (mobile app from USD 35,000; +15% contingency on fixed scope):

| Item | Estimate (USD) |
|---|---|
| Discovery sprint (2 weeks) | 4,500 |
| Patient app — iOS + Android | 36,000 |
| Clinic web console (120 doctors, schedules) | 14,000 |
| Payments integration + reminders | 7,500 |
| Contingency (15% of build) | 8,625 |
| **Total** | **70,625** |

**Payment milestones:** 30% on signing · 40% at UAT start · 30% at go-live.

Note: these are indicative until discovery confirms the scope. Anything below the package starting prices needs director approval.`,
      ],
    ],
  },
  {
    bot: "proposal", user: "user", title: "XYZ Logistics — fleet tracking proposal", days: 6,
    turns: [
      [
        "Which of our case studies fits a logistics client with 150 trucks?",
        `**RouteWise** is the closest match: a regional logistics company with 300 vehicles. We built a dispatcher dashboard, a driver app with offline mode, live tracking and proof of delivery in 14 weeks.

Outcomes worth quoting: **18% more deliveries per vehicle per day** and **billing disputes down 60%**.

For a 150-truck fleet I'd lead with RouteWise, then mention our cloud & DevOps work for the real-time tracking backend.`,
      ],
    ],
  },
  {
    bot: "proposal", user: "manager", title: "Healthcare Proposal — pricing check", days: 11,
    turns: [
      [
        "What's the minimum we can quote for an AI chat assistant?",
        `The pricing guide lists **AI chat assistants from USD 12,000**. Quoting below that needs approval from a director. Typical delivery is 4–8 weeks, and fixed-scope estimates should include the 15% contingency.`,
      ],
    ],
  },
  {
    bot: "requirements", user: "manager", title: "Review: vendor portal requirements", days: 1,
    turns: [
      [
        "Review these: 1) The system should be fast. 2) Vendors can upload invoices and the system should notify. 3) Admin can manage users etc.",
        `### Review

| # | Issue | Why it matters | Suggested rewrite |
|---|---|---|---|
| 1 | "fast" is vague, no number | Can't be tested | "Search results load within 2 s for 95% of requests at 200 concurrent users." |
| 2 | Compound requirement; "notify" has no actor or channel | Two requirements hidden in one; unclear who is notified | Split: "Vendors can upload invoices (PDF, max 10 MB)." and "The finance team is emailed within 5 minutes of a new invoice." |
| 3 | "etc." and "manage" are open-ended | Scope creep | List the actions: create, deactivate, reset password, assign role. |

### Missing non-functional requirements
Security & roles, audit trail of invoice changes, data retention, accessibility (WCAG 2.1 AA), browser support.

### Clarifying questions
1. What invoice statuses exist, and who can change them?
2. Is there an approval workflow before payment?
3. What happens to a duplicate invoice number?`,
      ],
      [
        "Good. Which of our standard business rules apply here?",
        `From the business rules library, these apply directly:
- **RULE-AUTH-01** — lock accounts for 15 minutes after 5 failed sign-ins (vendor accounts are external, so this matters).
- **RULE-AUTH-02** — minimum 10-character passwords.
- **RULE-NOTIF-01** — no notifications between 21:00 and 08:00 local time; relevant if vendors are emailed.
- **RULE-DATA-01** — delete personal data 30 days after an account-deletion request.

I'd add a portal-specific rule for duplicate invoices, e.g. *RULE-INV-01: an invoice number must be unique per vendor per financial year.*`,
      ],
    ],
  },
  {
    bot: "requirements", user: "user", title: "Gaps in the loan app requirements", days: 9,
    turns: [
      [
        "What non-functional requirements do teams usually forget?",
        `From our guidelines, the usual gaps are: **audit trail**, **data retention**, **accessibility (WCAG 2.1 AA)**, **backup & recovery**, **localisation** and exact **performance targets** (response time, volume, concurrency). For a loan app also check regulatory retention periods and role-based access to applicant documents.`,
      ],
    ],
  },
  {
    bot: "requirements", user: "limited", title: "Is this requirement testable?", days: 4,
    turns: [
      [
        "Is 'The dashboard must be user-friendly' a good requirement?",
        `No — "user-friendly" is on our red-flag list because it can't be tested. Rewrite it as something measurable, for example: *"A new manager can find last month's revenue from the dashboard in under 30 seconds without training, in 4 of 5 usability-test sessions."*`,
      ],
    ],
  },
  {
    bot: "brd", user: "manager", title: "BRD — Clinic booking app", days: 3,
    turns: [
      [
        "Create a BRD outline for a clinic appointment booking app: patients book, doctors manage slots, reminders by WhatsApp.",
        `# BRD — Clinic Appointment Booking (draft)

**2. Background:** Patients book by phone today; no-shows and call volume are high.

**3. Objectives:** reduce no-shows by 25% and phone bookings by 40% within 6 months of launch.

**4. Scope** — *In:* patient booking app, doctor slot management, WhatsApp reminders, cancellations. *Out:* telemedicine video, insurance claims.

**6. Business requirements**
- **BR-01 (Must)** Patients can book an available slot for a chosen doctor and clinic. *AC:* booking confirmed within 5 s; slot no longer bookable by others.
- **BR-02 (Must)** Doctors can open, block and edit their slots.
- **BR-03 (Must)** Patients receive a WhatsApp reminder 24 h and 2 h before the appointment.
- **BR-04 (Should)** Patients can cancel up to 4 h before the slot free of charge.

**7. Business rules:** RULE-APPT-01 (free cancellation up to 4 hours before), RULE-NOTIF-01 (no reminders 21:00–08:00).

**11. Success metrics:** no-show rate, % bookings via app, average booking time.

Shall I expand the requirements list or add personas?`,
      ],
    ],
  },
  {
    bot: "discovery", user: "user", title: "Discovery call — retail chain", days: 5,
    turns: [
      [
        "Prepare me for a discovery call tomorrow with a 20-store retail chain that wants an inventory app.",
        `## Agenda (45 min)
1. Their goals and what triggered the project (10 min)
2. Today's inventory process, step by step (15 min)
3. Must-haves for release 1 (10 min)
4. Constraints, decision process, next steps (10 min)

## Questions to ask
- What happens if you do nothing for 6 months?
- How many SKUs, and how often is stock counted today?
- Walk me through a stock transfer between two stores — where does it break?
- Which systems must we integrate with (POS, ERP)? Who owns them?
- If we could only ship three features first, which three?
- Target launch date, and what drives it?
- Budget range we should design within?
- Who signs off on the proposal?`,
      ],
      [
        "Summarise my notes: owner wants barcode scanning, 20 stores, 8k SKUs, POS is Tally, launch before Diwali, budget unclear.",
        `## Summary
Retail chain (20 stores, ~8,000 SKUs) wants a barcode-based inventory app, launched before Diwali.

**Pain points:** manual stock counts (implied), no real-time visibility across stores.
**Goals:** accurate stock per store; faster counts and transfers.
**Budget / timeline:** budget unclear; hard deadline before Diwali.
**Integrations:** Tally (POS/accounting) — ownership and API access unknown.
**Risks:** tight deadline; Tally integration effort; budget not confirmed.

## Next steps
1. Confirm budget range and decision-maker.
2. Get Tally version and API/export access.
3. Propose a 2-week discovery sprint to fix scope for a pre-Diwali release 1.`,
      ],
    ],
  },
  {
    bot: "discovery", user: "manager", title: "Questions for a fintech prospect", days: 13,
    turns: [
      [
        "Top 5 questions for a fintech lending prospect?",
        `1. What triggered this now, and what does success look like in a year?
2. Walk me through an application from submission to decision — where are the delays?
3. Which systems must we integrate with (credit bureau, core banking, KYC)?
4. What regulatory or data-retention constraints apply?
5. Who signs off, and are you evaluating other vendors?`,
      ],
    ],
  },
  {
    bot: "meeting", user: "limited", title: "Sprint review minutes", days: 1,
    turns: [
      [
        "Write minutes: sprint 7 review, attendees Priya (PM), Rahul (dev), Neha (QA), client Amit. Demoed login + booking. Amit wants SMS fallback when WhatsApp fails. Agreed to ship booking to UAT Friday. Payment gateway still pending credentials from client.",
        `# Sprint 7 Review — Minutes

**Attendees:** Priya (PM) · Rahul (Developer) · Neha (QA) · Amit (Client)

**Key discussion points**
- Demoed login and booking flows.
- Client requested an SMS fallback when WhatsApp delivery fails.
- Payment gateway integration is blocked on credentials.

**Decisions**
- D1: Booking goes to UAT on Friday.

**Action items**
| # | Action | Owner | Due |
|---|---|---|---|
| 1 | Deploy booking to UAT | Rahul | Friday |
| 2 | Test booking in UAT | Neha | TBD |
| 3 | Share payment gateway credentials | Amit | TBD |
| 4 | Estimate SMS fallback | Priya | TBD |

**Open questions:** Which SMS provider should the fallback use?`,
      ],
    ],
  },
  {
    bot: "meeting", user: "manager", title: "Weekly sync action items", days: 7,
    turns: [
      [
        "Action items only: Karan to fix the export bug by Wed, Sneha to send the design review, someone needs to renew the SSL cert.",
        `| # | Action | Owner | Due |
|---|---|---|---|
| 1 | Fix the export bug | Karan | Wednesday |
| 2 | Send the design review | Sneha | TBD |
| 3 | Renew the SSL certificate | **TBD — needs an owner** | TBD |`,
      ],
    ],
  },
  {
    bot: "general", user: "user", title: "Follow-up email to a client", days: 0,
    turns: [
      [
        "Write a short follow-up email to a client who hasn't replied to our proposal for a week.",
        `**Subject:** Following up on our proposal

Hi [Name],

I hope you're well. I wanted to follow up on the proposal we shared last week for [project]. Do you have any questions, or would a short call help to go through the scope or pricing?

If the timing has changed on your side, just let me know — happy to adjust.

Best regards,
[Your name]
Demo Company`,
      ],
    ],
  },
  {
    bot: "general", user: "limited", title: "Explain REST vs GraphQL", days: 3,
    turns: [
      [
        "Explain REST vs GraphQL simply.",
        `**REST**: the server exposes many fixed endpoints (\`/users/1\`, \`/users/1/orders\`). Each returns a fixed shape, so you sometimes get too much data or need several calls.

**GraphQL**: one endpoint; the client sends a query describing exactly the fields it wants, and gets just that in one response.

**Rule of thumb:** REST is simpler to build, cache and secure; GraphQL shines when many different screens need different slices of related data.`,
      ],
      [
        "Which would you pick for a simple admin product?",
        `REST. A simple admin product has predictable screens, and REST's simplicity, HTTP caching and mature tooling outweigh GraphQL's flexibility there.`,
      ],
    ],
  },
  {
    bot: "general", user: "manager", title: "Plan my week", days: 6,
    turns: [
      [
        "Help me plan a week with 3 client calls, a proposal due Thursday and sprint planning on Monday.",
        `| Day | Focus |
|---|---|
| Monday | Sprint planning (morning) · outline the proposal (afternoon) |
| Tuesday | Client call 1 · proposal first draft |
| Wednesday | Client call 2 · internal review of the proposal |
| Thursday | Final edits and **send the proposal by noon** |
| Friday | Client call 3 · weekly wrap-up and next week's priorities |

Keep one 2-hour focus block each day with notifications off.`,
      ],
    ],
  },
  {
    bot: "general", user: "admin", title: "Summarise an article", days: 10,
    turns: [
      [
        "Summarise in 3 bullets: remote teams work best with written decisions, overlapping hours and clear ownership.",
        `- Write decisions down so everyone can find and follow them.
- Keep a few overlapping working hours for real-time collaboration.
- Give every task one clear owner.`,
      ],
    ],
  },
  {
    bot: "sow", user: "manager", title: "SOW draft — MedBook phase 2", days: 20,
    turns: [
      [
        "Outline an SOW for phase 2 of MedBook: telemedicine video visits, 10 weeks.",
        `# SOW — MedBook Phase 2 (outline)

2. **Overview:** add video visits to the existing booking platform.
3. **Scope** — *In:* video visits in the patient app, doctor video console, e-prescriptions. *Out:* insurance claims.
4. **Deliverables & acceptance:** video visit with < 2% dropped calls in UAT; prescription PDF emailed after the visit.
5. **Milestones:** discovery (wk 1–2) · build (wk 3–8) · UAT (wk 9) · go-live (wk 10).
8. **Change control:** written change requests, estimated before approval.
9. **Payments:** 30% signing · 40% UAT start · 30% go-live.
10. **Warranty:** 90 days after go-live.`,
      ],
    ],
  },
];

/** Extra usage-only history (no chat content) so the dashboard has a month of data: [daysAgo, botKey, user, status]. */
export const EXTRA_RUN_PATTERN = [
  [28, "proposal", "user", "completed"], [27, "general", "manager", "completed"], [25, "requirements", "manager", "completed"],
  [24, "discovery", "user", "completed"], [22, "general", "limited", "completed"], [21, "brd", "manager", "failed"],
  [19, "meeting", "limited", "completed"], [18, "proposal", "user", "completed"], [17, "general", "admin", "stopped"],
  [16, "requirements", "user", "completed"], [15, "discovery", "manager", "completed"], [14, "proposal", "manager", "completed"],
  [12, "general", "user", "completed"], [11, "meeting", "manager", "completed"], [9, "brd", "manager", "completed"],
  [8, "general", "limited", "failed"], [7, "proposal", "user", "completed"], [5, "requirements", "manager", "completed"],
  [4, "general", "user", "completed"], [2, "discovery", "user", "completed"], [1, "general", "manager", "completed"], [0, "proposal", "user", "completed"],
];
