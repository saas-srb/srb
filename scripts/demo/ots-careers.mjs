// Online Test System — recruitment screening tests for every job on the public careers page
// (`src/app/(site)/careers/jobs-data.ts`). Each role gets:
//   - a question category named after the role, with questions written from that job's listed skills;
//   - a published "<Role> Screening Test" (objective knowledge section + one written response marked by an evaluator),
//     held for the hiring team to publish (resultRelease "manual", score only);
//   - an assignment by POSITION to the real applicants who applied for that role (`career_applications.positionSlug`),
//     with attempts that match each applicant's hiring stage (shortlisted → not started yet, interview / selected /
//     hired → taken and scored, some written answers still waiting for an evaluator).
// Applicants are never invented here: a role nobody has applied for gets its test but no assignments.
//
// Idempotent: every row has a `demo-ots-car-` id and is replaced on each run. Called by `npm run demo:seeders`.
import { makeRng } from "./lib.mjs";
import { CONFIG, autoGradable, computeResult, grade, publicView, respond, section } from "./ots.mjs";

const D = "demo-ots-car-";
const DAY = 86400000;
const NOW = Date.now();
const rng = makeRng(20260927);
const rint = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
const at = (daysAgo, hour = 11, min = 0) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
};
const stamp = (d, by = null) => ({ createdAt: d, updatedAt: d, createdBy: by, updatedBy: by, deletedAt: null });
const opts = (...t) => t.map((text, i) => ({ id: `o${i + 1}`, text }));
const sc = (difficulty, topic, prompt, options, correct, explanation = "") => ({ type: "single_choice", difficulty, topic, prompt, definition: { options: opts(...options), correct: [`o${correct}`] }, explanation });
const ms = (difficulty, topic, prompt, options, correct) => ({ type: "multiple_select", difficulty, topic, prompt, definition: { options: opts(...options), correct: correct.map((c) => `o${c}`) } });
const tf = (difficulty, topic, prompt, answer) => ({ type: "true_false", difficulty, topic, prompt, definition: { options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: [answer ? "true" : "false"] } });
const written = (topic, prompt, rubric, sample) => ({ type: "long_answer", difficulty: "intermediate", topic, prompt, definition: { acceptedAnswers: [], caseSensitive: false, maxLength: 2500, rubric }, marks: 5, sample });

/** One entry per careers-page job (same slugs / titles). Questions follow each job's `skills` list. */
export const CAREER_TESTS = [
  {
    slug: "mern-developer", title: "MERN Developer", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "React", "In React, which hook runs side effects after render?", ["useState", "useEffect", "useMemo", "useId"], 2),
      sc("intermediate", "Node.js", "Which Express method registers middleware for every route?", ["app.route()", "app.use()", "app.all()", "app.listen()"], 2),
      sc("intermediate", "MongoDB", "Which MongoDB feature makes a query on `email` fast?", ["A capped collection", "An index on email", "A $lookup stage", "A larger batchSize"], 2),
      sc("intermediate", "REST APIs", "A request to create a resource succeeded. The best HTTP status is…", ["200 OK", "201 Created", "204 No Content", "302 Found"], 2),
      ms("intermediate", "JavaScript / TypeScript", "Which of these are TypeScript utility types? (select all)", ["Partial<T>", "Pick<T, K>", "Merge<T>", "Readonly<T>"], [1, 2, 4]),
      tf("beginner", "Git", "`git rebase` rewrites commit history.", true),
      sc("advanced", "MongoDB", "An aggregation needs data from another collection. Which stage?", ["$group", "$unwind", "$lookup", "$project"], 3),
      written("System design", "Describe how you would add pagination to an Express + MongoDB list API that returns 50,000 orders.", "Chooses cursor/range pagination over large skip (2), indexes the sort field (1), returns next-cursor + page size limits (1), mentions React side / UX (1).", "Use cursor-based pagination on an indexed createdAt+_id, return a nextCursor and cap limit at 100; avoid large skip values."),
    ],
  },
  {
    slug: "genai-developer", title: "GenAI Developer", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "RAG", "What does RAG stand for?", ["Rapid Agent Generation", "Retrieval-Augmented Generation", "Recursive Answer Grading", "Random Attention Gate"], 2),
      sc("intermediate", "Vector Databases", "Embeddings are compared in a vector database mostly by…", ["Exact string match", "Cosine similarity / distance", "Alphabetical order", "Row IDs"], 2),
      sc("intermediate", "Prompt Engineering", "The most reliable way to get machine-readable output from an LLM is…", ["Asking politely", "A structured-output / JSON schema constraint", "Raising temperature", "Longer system prompts"], 2),
      ms("intermediate", "LLM APIs", "Which settings reduce randomness in LLM output? (select all)", ["Lower temperature", "Lower top_p", "Higher max_tokens", "Fixed seed (where supported)"], [1, 2, 4]),
      sc("advanced", "RAG", "Answers are fluent but cite the wrong documents. The first thing to evaluate is…", ["The chat UI", "Retrieval quality (recall / precision of chunks)", "The model's temperature", "GPU memory"], 2),
      tf("beginner", "Python", "`async def` functions return a coroutine that must be awaited.", true),
      sc("intermediate", "FastAPI", "In FastAPI, request bodies are validated with…", ["Jinja templates", "Pydantic models", "SQLAlchemy sessions", "Celery tasks"], 2),
      written("Guardrails", "An LLM feature sometimes invents refund policies. How would you reduce this in production?", "Grounds answers in retrieved policy text (2), refusal / fallback when not found (1), evaluation set + monitoring (1), human escalation (1).", "Ground answers in retrieved policy docs, instruct refusal when not covered, add an eval set and monitor hallucination rate, escalate to support."),
    ],
  },
  {
    slug: "ai-ml-engineer", title: "AI/ML Engineer", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "ML fundamentals", "A model scores 99% on training data and 70% on test data. This is…", ["Underfitting", "Overfitting", "Data leakage fixed", "Perfect generalisation"], 2),
      sc("intermediate", "scikit-learn", "Which metric suits a heavily imbalanced fraud dataset best?", ["Accuracy", "Precision / recall (or F1, PR-AUC)", "Mean squared error", "R²"], 2),
      sc("intermediate", "PyTorch / TensorFlow", "In PyTorch, gradients are computed by calling…", ["model.eval()", "loss.backward()", "optimizer.zero_grad()", "torch.no_grad()"], 2),
      ms("intermediate", "MLOps", "Which are signs of data drift in production? (select all)", ["Feature distributions shift", "Prediction confidence changes", "Faster CI builds", "Accuracy drops on fresh labels"], [1, 2, 4]),
      sc("intermediate", "SQL", "Which SQL clause removes duplicate rows from a result?", ["UNIQUE", "DISTINCT", "GROUP ALL", "FILTER"], 2),
      tf("beginner", "Docker", "A Docker image is a running instance of a container.", false),
      sc("advanced", "ML fundamentals", "Target leakage most often comes from…", ["Too few epochs", "Features that encode the label or future information", "Using a GPU", "Normalising inputs"], 2),
      written("Deployment", "Outline how you would take a trained classification model to a monitored production API.", "Packaging + versioning (1), serving API + latency (1), input validation (1), drift / performance monitoring (1), rollback / retraining plan (1).", "Version the model, containerise a FastAPI service, validate inputs, log predictions, monitor drift and accuracy, keep a rollback path and retraining schedule."),
    ],
  },
  {
    slug: "android-app-developer", title: "Android App Developer", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "Kotlin", "In Kotlin, `val` declares…", ["A mutable variable", "A read-only reference", "A static constant only", "A nullable type"], 2),
      sc("intermediate", "Jetpack Compose", "In Compose, state that should survive recomposition is held with…", ["remember { mutableStateOf(...) }", "A global var", "findViewById", "SharedPreferences only"], 1),
      sc("intermediate", "MVVM", "In MVVM, UI state exposed to the screen usually lives in…", ["The Activity", "The ViewModel", "The Room DAO", "The Manifest"], 2),
      sc("intermediate", "Room", "Room is…", ["A networking library", "An SQLite object-mapping library", "A DI framework", "A test runner"], 2),
      sc("intermediate", "Retrofit", "Retrofit is used to…", ["Draw UI", "Make typed HTTP API calls", "Store images", "Schedule alarms"], 2),
      tf("beginner", "Kotlin", "Kotlin coroutines let you write asynchronous code sequentially.", true),
      ms("advanced", "Performance", "Which help prevent ANRs? (select all)", ["Move disk/network work off the main thread", "Use coroutines with Dispatchers.IO", "Block the UI thread while loading", "Use WorkManager for deferrable work"], [1, 2, 4]),
      written("Offline-first", "How would you make a notes app work offline and sync when back online?", "Local source of truth (Room) (2), sync queue / WorkManager (1), conflict strategy (1), UI states (1).", "Room as source of truth, queue changes, WorkManager sync on connectivity, last-write-wins or merge rules, show sync status."),
    ],
  },
  {
    slug: "ios-app-developer", title: "iOS App Developer", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "Swift", "Which Swift keyword declares a constant?", ["var", "let", "const", "static"], 2),
      sc("intermediate", "SwiftUI", "In SwiftUI, a view owns mutable local state with…", ["@State", "@Binding", "@Environment", "@IBOutlet"], 1),
      sc("intermediate", "Swift", "`guard let` is mainly used to…", ["Loop over arrays", "Unwrap optionals and exit early", "Declare protocols", "Start threads"], 2),
      sc("intermediate", "Combine", "In Combine, a Publisher emits values to a…", ["Delegate", "Subscriber", "Storyboard", "Scene"], 2),
      tf("beginner", "UIKit", "UI updates in UIKit must happen on the main thread.", true),
      sc("intermediate", "App Store Connect", "Beta builds are distributed to testers through…", ["Xcode Cloud only", "TestFlight", "CocoaPods", "Instruments"], 2),
      ms("advanced", "Memory", "Which can cause retain cycles? (select all)", ["A closure capturing self strongly", "Two objects holding strong references to each other", "Using [weak self] in closures", "Delegates declared as strong properties"], [1, 2, 4]),
      written("Architecture", "How would you structure a SwiftUI app with a REST API so it stays testable?", "Separation of view / view model / service (2), dependency injection / protocols for mocking (2), error + loading states (1).", "Views observe view models; view models call a protocol-based API service injected for tests; model loading/error states explicitly."),
    ],
  },
  {
    slug: "quality-analyst", title: "Quality Analyst", category: "Engineering & Development", minutes: 60,
    questions: [
      sc("beginner", "Manual & Automated Testing", "Re-testing existing features after a change is called…", ["Smoke testing", "Regression testing", "Load testing", "Alpha testing"], 2),
      sc("intermediate", "Selenium / Cypress / Playwright", "The main cause of flaky UI tests is usually…", ["Too many assertions", "Timing / waits on async UI", "Using CSS selectors", "Headless mode"], 2),
      sc("intermediate", "API Testing", "Which verifies an API returns the right JSON shape?", ["Schema / contract assertions", "Visual snapshot", "Load test", "Code coverage"], 1),
      sc("intermediate", "JIRA", "A defect report must include…", ["Only a title", "Steps to reproduce, expected vs actual, environment", "The developer's name", "A fix"], 2),
      sc("intermediate", "SQL", "To find orders with no matching customer you would use…", ["INNER JOIN", "LEFT JOIN … WHERE customer.id IS NULL", "CROSS JOIN", "UNION"], 2),
      tf("beginner", "Testing", "100% code coverage guarantees the software has no bugs.", false),
      ms("advanced", "Test Planning", "Which belong in a test plan? (select all)", ["Scope and out-of-scope", "Entry / exit criteria", "Developer salaries", "Risks and environments"], [1, 2, 4]),
      written("Test design", "Write the key test cases for a login form with email, password and 'remember me'.", "Positive + negative credentials (1), validation / boundaries (1), lockout / security (1), remember-me session behaviour (1), accessibility / UX (1).", "Valid login, wrong password, unknown email, empty/invalid email, lockout after N failures, remember-me persists session, logout clears, keyboard/screen-reader usable."),
    ],
  },
  {
    slug: "ui-ux-designer", title: "UI/UX Designer", category: "Design", minutes: 60,
    questions: [
      sc("beginner", "Figma", "In Figma, reusable UI elements are built as…", ["Frames only", "Components (with variants)", "Flattened layers", "Exported PNGs"], 2),
      sc("intermediate", "Accessibility", "WCAG AA contrast for normal body text is at least…", ["2:1", "3:1", "4.5:1", "7:1"], 3),
      sc("intermediate", "User Research", "Five users per usability round is recommended because…", ["It is the legal minimum", "It finds most major issues cheaply; iterate in rounds", "Statistics require it", "Tools limit it"], 2),
      sc("intermediate", "Design Systems", "A design token is…", ["A login credential", "A named design value (colour, spacing, type) shared by design and code", "A Figma plugin", "A font license"], 2),
      tf("beginner", "Prototyping", "A clickable prototype is useful for testing flows before development.", true),
      ms("intermediate", "HTML/CSS Basics", "Which CSS features help build responsive layouts? (select all)", ["Flexbox", "CSS Grid", "Media queries", "Fixed pixel widths everywhere"], [1, 2, 3]),
      sc("advanced", "UX", "Users abandon checkout at the address step. Your first move is…", ["Redesign the logo", "Look at analytics + session recordings, then test the step", "Add more fields", "Change the brand colour"], 2),
      written("Case study", "Walk us through how you would redesign a cluttered admin dashboard.", "Research / goals first (1), information hierarchy (1), design system reuse (1), validate with users (1), measurable outcome (1).", "Interview users about top tasks, audit data, prioritise key metrics, restructure hierarchy with components, test a prototype, measure task time."),
    ],
  },
  {
    slug: "business-development-manager", title: "Business Development Manager", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "B2B Sales", "An ICP is…", ["Initial Contract Price", "Ideal Customer Profile", "Internal Cost Plan", "Invoice Control Process"], 2),
      sc("intermediate", "Lead Generation", "Which lead is the most qualified?", ["Downloaded an e-book", "Has budget, authority, need and a timeline", "Follows us on social", "Opened one email"], 2),
      sc("intermediate", "CRM Tools", "Pipeline stages in a CRM are mainly used to…", ["Store passwords", "Forecast revenue and track deal progress", "Design websites", "Pay invoices"], 2),
      sc("intermediate", "Negotiation", "BATNA means…", ["Best Alternative To a Negotiated Agreement", "Base Annual Target", "Bid And Tender Notice", "Budget After Tax"], 1),
      tf("beginner", "Proposal Writing", "A good proposal restates the client's problem before the solution.", true),
      ms("intermediate", "B2B Sales", "Which are healthy sales KPIs? (select all)", ["Win rate", "Sales cycle length", "Pipeline coverage", "Number of emojis per email"], [1, 2, 3]),
      sc("advanced", "Negotiation", "A client asks for a 30% discount at the last minute. Best response?", ["Accept immediately", "Trade: reduce scope or ask for longer commitment in return", "Walk away", "Ignore the request"], 2),
      written("Territory plan", "Outline a 90-day plan to open a new mid-market segment for our AI automation services.", "Target list / ICP (1), outreach channels (1), offer / positioning (1), metrics and targets (1), partnerships or events (1).", "Define ICP, build 200-account list, LinkedIn + email sequences, free automation audit offer, weekly pipeline targets, two partner events."),
    ],
  },
  {
    slug: "business-analyst", title: "Business Analyst", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "User Stories", "Which is a well-formed user story?", ["Build a login page", "As a buyer, I want to save my cart so that I can finish later", "Login must be fast", "Fix bug 123"], 2),
      sc("intermediate", "Requirements Gathering", "Acceptance criteria describe…", ["Developer tasks", "Conditions a story must satisfy to be accepted", "Sprint velocity", "Server specs"], 2),
      sc("intermediate", "Process Mapping", "BPMN is used to…", ["Write SQL", "Model business processes", "Design logos", "Track time"], 2),
      sc("intermediate", "SQL Basics", "Which counts orders per customer?", ["SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id", "SELECT COUNT(customer_id) FROM orders", "SELECT * FROM orders ORDER BY customer_id", "SELECT SUM(*) FROM orders"], 1),
      tf("beginner", "JIRA / Confluence", "Confluence is typically used for documentation, JIRA for tracking work items.", true),
      ms("intermediate", "Requirements Gathering", "Which are elicitation techniques? (select all)", ["Stakeholder interviews", "Workshops", "Observation / shadowing", "Guessing"], [1, 2, 3]),
      sc("advanced", "Prioritisation", "MoSCoW prioritisation stands for…", ["Must, Should, Could, Won't", "Money, Scope, Cost, Work", "Modules, Services, Components, Workflows", "None of these"], 1),
      written("Requirements", "A client says 'we need a dashboard'. What questions do you ask before writing requirements?", "Who uses it + decisions it supports (2), metrics / data sources (1), frequency / freshness (1), success measure (1).", "Who uses it, which decisions it drives, which KPIs and data sources, how fresh, what's broken today, how we'll measure success."),
    ],
  },
  {
    slug: "project-manager", title: "Project Manager", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "Agile / Scrum", "Who owns the product backlog in Scrum?", ["Scrum Master", "Product Owner", "Development team", "Stakeholders"], 2),
      sc("intermediate", "Agile / Scrum", "The purpose of a sprint retrospective is to…", ["Demo features to clients", "Improve how the team works", "Estimate the backlog", "Assign blame"], 2),
      sc("intermediate", "Risk Management", "A risk register records…", ["Only past issues", "Risks with probability, impact, owner and mitigation", "Team salaries", "Server logs"], 2),
      sc("intermediate", "Budgeting", "CPI below 1.0 means the project is…", ["Under budget", "Over budget", "Ahead of schedule", "Behind schedule"], 2),
      tf("beginner", "JIRA", "Burndown charts show remaining work over time.", true),
      ms("intermediate", "Stakeholder Management", "Good status reports include… (select all)", ["Progress vs plan", "Risks and blockers", "Decisions needed", "Every commit message"], [1, 2, 3]),
      sc("advanced", "Scope", "The client adds features mid-sprint. You should…", ["Add them silently", "Capture as change requests, assess impact, re-prioritise with the PO", "Refuse all changes", "Extend the sprint"], 2),
      written("Recovery", "Your project is three weeks late with a fixed launch date. What do you do?", "Diagnose causes (1), options: scope / resources / phasing (2), stakeholder communication (1), plan + tracking (1).", "Find root causes, cut to MVP scope with the PO, add targeted help, phase the rest, communicate a re-baselined plan and track daily."),
    ],
  },
  {
    slug: "bid-executive", title: "Bid Executive", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "Upwork / Freelancer", "The first lines of a bid proposal should…", ["List every past project", "Show you understood the client's specific problem", "State your hourly rate", "Ask for a call"], 2),
      sc("intermediate", "Pre-Sales", "Before quoting a fixed price you must…", ["Guess quickly", "Clarify scope, deliverables and assumptions", "Offer the lowest price", "Skip estimation"], 2),
      sc("intermediate", "Proposal Writing", "A strong proposal includes…", ["Only the price", "Approach, milestones, timeline, price and relevant proof", "Company history only", "Generic templates"], 2),
      sc("intermediate", "Client Communication", "A client hasn't replied for a week. Best follow-up?", ["Stop contacting", "Short, value-adding follow-up with a clear next step", "Send ten messages", "Lower the price"], 2),
      tf("beginner", "MS Office", "Tracked changes in Word let reviewers see edits to a proposal.", true),
      ms("intermediate", "Pre-Sales", "Which reduce proposal rejection? (select all)", ["Tailoring to the job post", "Relevant case studies", "Clear timeline", "Copy-pasting the same bid everywhere"], [1, 2, 3]),
      sc("intermediate", "Bidding", "Connects / bids should be spent mostly on jobs that…", ["Were posted weeks ago with 50+ proposals", "Match our strengths and have verified payment", "Pay the least", "Have no description"], 2),
      written("Proposal", "Write the opening paragraph of a bid for 'Build a React dashboard for our logistics data'.", "Mirrors the client's need (2), relevant proof (1), concrete next step (1), concise and error-free (1).", "You need live visibility of shipments without spreadsheets. We've built React dashboards for two logistics firms; happy to share a 3-day plan on a quick call."),
    ],
  },
  {
    slug: "accounts-manager", title: "Accounts Manager", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "Accounting", "Under double-entry accounting, every transaction affects…", ["One account", "At least two accounts (debit and credit)", "Only cash", "Only the P&L"], 2),
      sc("intermediate", "GST & Compliance", "GST on an intra-state sale in India is split into…", ["IGST only", "CGST + SGST", "TDS + TCS", "VAT + CST"], 2),
      sc("intermediate", "Invoicing", "Accounts receivable represents…", ["Money the company owes", "Money customers owe the company", "Cash in bank", "Fixed assets"], 2),
      sc("intermediate", "Tally / QuickBooks", "A bank reconciliation compares…", ["Two invoices", "Book records with the bank statement", "Salary and tax", "Budget and forecast"], 2),
      tf("beginner", "MS Excel", "SUMIFS can add values that meet multiple conditions.", true),
      ms("intermediate", "GST & Compliance", "Which are needed on a valid GST tax invoice? (select all)", ["Supplier GSTIN", "Invoice number and date", "HSN / SAC code", "The accountant's photo"], [1, 2, 3]),
      sc("advanced", "Accounting", "Depreciation reduces…", ["Cash immediately", "The book value of an asset over time", "Revenue", "Liabilities"], 2),
      written("Month-end", "List the steps you follow to close the books at month end.", "Reconciliations (1), accruals / prepayments (1), receivables / payables review (1), GST / TDS checks (1), reports + variance review (1).", "Reconcile bank and ledgers, post accruals and depreciation, review AR/AP ageing, verify GST/TDS, run P&L and balance sheet, explain variances."),
    ],
  },
  {
    slug: "mis-executive", title: "MIS Executive", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "MS Excel", "Which Excel function finds a value in the first column of a range and returns a matching value?", ["INDEX", "VLOOKUP (or XLOOKUP)", "CONCAT", "ROUND"], 2),
      sc("intermediate", "MS Excel", "A PivotTable is best for…", ["Writing macros", "Summarising large data by categories", "Drawing shapes", "Protecting sheets"], 2),
      sc("intermediate", "SQL", "Which SQL clause filters grouped results?", ["WHERE", "HAVING", "LIMIT", "ORDER BY"], 2),
      sc("intermediate", "Power BI / Tableau", "In Power BI, a measure is…", ["A static column", "A calculation evaluated in the report's filter context", "A data source", "A theme"], 2),
      tf("beginner", "Data Validation", "Data validation rules can stop invalid entries in Excel cells.", true),
      ms("intermediate", "Report Automation", "Which automate recurring reports? (select all)", ["Scheduled refresh in Power BI", "Excel Power Query", "Macros / scripts", "Retyping numbers daily"], [1, 2, 3]),
      sc("advanced", "Data Validation", "Two reports show different revenue for the same month. First step?", ["Average them", "Compare definitions, filters and source extracts", "Delete one", "Round the numbers"], 2),
      written("Dashboard", "Describe the daily sales MIS you would build for a regional manager.", "Right KPIs (2), data source + refresh (1), drill-down by region / rep (1), validation checks (1).", "Daily sales vs target, pipeline, top reps and products by region with drill-down; auto-refresh from the CRM each morning with row-count checks."),
    ],
  },
  {
    slug: "hr-executive", title: "HR Executive", category: "Business & Operations", minutes: 60,
    questions: [
      sc("beginner", "Recruitment", "A job description should primarily…", ["List perks only", "Describe the role, responsibilities and must-have skills", "Be as long as possible", "Hide the location"], 2),
      sc("intermediate", "Onboarding", "Good onboarding in week one includes…", ["Only an ID card", "Access, buddy, role goals and introductions", "Performance review", "Exit interview"], 2),
      sc("intermediate", "HRMS / ATS", "An ATS is used to…", ["Run payroll", "Track candidates through the hiring pipeline", "Book travel", "Store code"], 2),
      sc("intermediate", "HR Compliance", "Under Indian labour law, PF contributions are made by…", ["Employee only", "Employer and employee", "Government only", "Nobody for full-time staff"], 2),
      tf("beginner", "Employee Engagement", "Regular one-on-ones help catch attrition risk early.", true),
      ms("intermediate", "Recruitment", "Which reduce time-to-hire? (select all)", ["Structured interviews with a scorecard", "Clear hiring-manager SLAs", "Screening tests for volume roles", "Adding more interview rounds"], [1, 2, 3]),
      sc("advanced", "HR Compliance", "An employee raises a harassment complaint. Your first step is to…", ["Ignore it until the review cycle", "Follow the POSH policy — record it and involve the Internal Committee", "Tell the whole team", "Ask them to resolve it privately"], 2),
      written("Engagement", "Attrition in the engineering team rose to 25% this year. What would you do?", "Data: exit interviews / stay interviews (1), root causes (1), concrete actions (2), measure impact (1).", "Analyse exit interviews and run stay interviews, fix top causes (growth paths, pay bands, manager coaching), track monthly attrition and eNPS."),
    ],
  },
  {
    slug: "technical-content-writer", title: "Technical Content Writer", category: "Marketing & Content", minutes: 60,
    questions: [
      sc("beginner", "Technical Writing", "The best opening for a how-to article is…", ["A company history", "What the reader will achieve and prerequisites", "A long quote", "A list of references"], 2),
      sc("intermediate", "SEO Writing", "Search intent means…", ["Keyword density", "What the searcher is actually trying to accomplish", "Page load time", "Backlink count"], 2),
      sc("intermediate", "Editing", "Which sentence is in active voice?", ["The bug was fixed by the team.", "The team fixed the bug.", "The bug has been fixed.", "Fixing of the bug was done."], 2),
      sc("intermediate", "Content Strategy", "A pillar page is…", ["A 404 page", "A broad guide that links to related in-depth articles", "A press release", "A footer link"], 2),
      tf("beginner", "CMS Tools", "Meta descriptions directly appear in search results as the snippet (when Google uses them).", true),
      ms("intermediate", "Technical Writing", "Which improve readability of technical docs? (select all)", ["Short sections with headings", "Code samples that run", "Consistent terminology", "Walls of unbroken text"], [1, 2, 3]),
      sc("advanced", "SEO Writing", "Two of our articles compete for the same keyword. This is…", ["Link building", "Keyword cannibalisation — consolidate or differentiate", "Good for rankings", "Duplicate hosting"], 2),
      written("Writing sample", "In under 120 words, explain what an API is to a non-technical business owner.", "Accurate (2), plain language / analogy (1), relevant business example (1), within length (1).", "An API is like a waiter between two systems: your app asks for something, the API delivers the request and brings back the answer — e.g. your website checking stock in your inventory system."),
    ],
  },
  {
    slug: "digital-marketing", title: "Digital Marketing", category: "Marketing & Content", minutes: 60,
    questions: [
      sc("beginner", "SEO", "Which is an on-page SEO factor?", ["Backlinks from other sites", "Title tags and headings", "Social shares", "Domain age"], 2),
      sc("intermediate", "Google Ads", "Quality Score in Google Ads depends on…", ["Budget only", "Expected CTR, ad relevance and landing page experience", "Account age", "Number of campaigns"], 2),
      sc("intermediate", "Meta Ads", "A lookalike audience is built from…", ["Random users", "A seed audience such as customers or leads", "Only interests", "Competitors' followers"], 2),
      sc("intermediate", "Google Analytics", "In GA4, a conversion is…", ["Any pageview", "An event marked as a key event / conversion", "A session", "A bounce"], 2),
      tf("beginner", "Email Marketing", "Segmenting an email list usually improves open and click rates.", true),
      ms("intermediate", "Social Media Marketing", "Which are good social KPIs for a B2B brand? (select all)", ["Engagement rate", "Click-throughs to site", "Leads from social", "Number of posts deleted"], [1, 2, 3]),
      sc("advanced", "Google Ads", "CPA doubled after raising budget. What do you check first?", ["Font size", "Search terms, audience expansion and bid strategy changes", "Logo colour", "Nothing — it's normal"], 2),
      written("Campaign plan", "Plan a ₹2 lakh / month campaign to generate leads for our AI automation services.", "Channel mix with rationale (1), targeting (1), offer + landing page (1), tracking (1), KPIs / optimisation cadence (1).", "60% Google search on automation keywords, 40% LinkedIn to ops heads; free audit offer on a dedicated page; GA4 + CRM tracking; weekly CPA review."),
    ],
  },
];

/** 12 more knowledge questions per role (appended after the original 8 so existing question ids never change). */
const EXTRA_QUESTIONS = {
  "mern-developer": [
    sc("beginner", "JavaScript / TypeScript", "Which method converts a JSON string into a JavaScript object?", ["JSON.stringify()", "JSON.parse()", "Object.from()", "String.toJSON()"], 2),
    sc("beginner", "React", "Props in React are…", ["Mutable state owned by the child", "Read-only inputs passed from a parent component", "Global variables", "CSS classes"], 2),
    sc("intermediate", "React", "Which hook memoises an expensive computed value between renders?", ["useCallback", "useMemo", "useRef", "useReducer"], 2),
    sc("intermediate", "Node.js", "What does `npm ci` do differently from `npm install`?", ["Installs globally", "Installs exactly from package-lock.json and fails if it disagrees with package.json", "Skips devDependencies always", "Updates every package to latest"], 2),
    sc("intermediate", "Express", "In Express, an error-handling middleware is recognised because it has…", ["The name `error`", "Four parameters (err, req, res, next)", "A try/catch block", "An `async` keyword"], 2),
    sc("intermediate", "MongoDB", "Which operator adds a value to an array only if it is not already present?", ["$push", "$addToSet", "$set", "$inc"], 2),
    sc("intermediate", "REST APIs", "Which HTTP method is idempotent and replaces a resource entirely?", ["POST", "PUT", "PATCH", "CONNECT"], 2),
    sc("intermediate", "Security", "Storing a JWT in an HttpOnly cookie mainly protects it from…", ["SQL injection", "Being read by injected JavaScript (XSS)", "Network latency", "Expiry"], 2),
    ms("intermediate", "Tailwind CSS", "Which are valid Tailwind utility classes? (select all)", ["flex", "mt-4", "text-center", "margin-top: 4"], [1, 2, 3]),
    tf("beginner", "Git", "`git pull` is a `git fetch` followed by a merge (or rebase) into the current branch.", true),
    sc("advanced", "Node.js", "A CPU-heavy loop inside an Express route will…", ["Only slow that request", "Block the event loop and delay every other request", "Automatically run on another core", "Be cancelled by Node"], 2),
    sc("advanced", "MongoDB", "For a query filtering on `status` and sorting by `createdAt`, the most useful index is…", ["{ createdAt: 1 }", "{ status: 1, createdAt: -1 }", "{ _id: 1 }", "A text index on status"], 2),
  ],
  "genai-developer": [
    sc("beginner", "LLM APIs", "A \"token\" in an LLM API is…", ["An API key", "A chunk of text (roughly part of a word) the model reads or writes", "A user session", "A billing invoice"], 2),
    sc("beginner", "Prompt Engineering", "The system prompt is mainly used to…", ["Store user passwords", "Set the model's role, rules and behaviour", "Increase output length", "Choose the GPU"], 2),
    sc("intermediate", "RAG", "Why are documents split into chunks before embedding?", ["To save disk only", "So retrieval returns focused passages that fit the context window", "Because embeddings require exactly one sentence", "To hide data from the model"], 2),
    sc("intermediate", "Vector Databases", "Which is a vector database or vector index?", ["Redis Streams", "pgvector / Pinecone / Qdrant", "RabbitMQ", "Memcached"], 2),
    sc("intermediate", "LangChain", "In LangChain, a \"retriever\" is responsible for…", ["Generating images", "Fetching relevant documents for a query", "Billing", "Tokenising only"], 2),
    sc("intermediate", "LLM APIs", "Tool / function calling lets a model…", ["Execute code on the client automatically", "Return structured arguments for a function your code then runs", "Browse the web by default", "Train itself"], 2),
    sc("intermediate", "Python", "Which Python construct runs several API calls concurrently?", ["A for loop with time.sleep", "asyncio.gather()", "list.sort()", "global variables"], 2),
    sc("intermediate", "Prompt Engineering", "Few-shot prompting means…", ["Using a smaller model", "Including worked examples of input and output in the prompt", "Limiting the answer to a few words", "Retrying several times"], 2),
    ms("intermediate", "RAG", "Which improve RAG answer quality? (select all)", ["Re-ranking retrieved chunks", "Hybrid keyword + vector search", "Good chunk size / overlap", "Removing all metadata"], [1, 2, 3]),
    tf("beginner", "LLM APIs", "Every model has a context window limit on how many tokens it can consider at once.", true),
    sc("advanced", "Guardrails", "Prompt injection is when…", ["The model runs out of tokens", "Untrusted input contains instructions that try to override the system's rules", "The API key leaks", "Embeddings drift"], 2),
    sc("advanced", "Model Evaluation", "The most reliable way to compare two prompt versions is…", ["Reading one answer each", "Running both on a fixed evaluation set with defined metrics", "Asking the model which is better once", "Choosing the longer prompt"], 2),
  ],
  "ai-ml-engineer": [
    sc("beginner", "ML fundamentals", "Predicting a house price is which type of problem?", ["Classification", "Regression", "Clustering", "Reinforcement learning"], 2),
    sc("beginner", "ML fundamentals", "The test set should be used…", ["For tuning hyper-parameters repeatedly", "Once, for the final unbiased evaluation", "For training", "Never"], 2),
    sc("intermediate", "scikit-learn", "K-fold cross-validation is used to…", ["Speed up training", "Get a more reliable estimate of model performance", "Remove outliers", "Encode categories"], 2),
    sc("intermediate", "ML fundamentals", "L2 regularisation mainly helps to…", ["Increase variance", "Reduce overfitting by penalising large weights", "Add more features", "Balance classes"], 2),
    sc("intermediate", "ML fundamentals", "Which algorithm is unsupervised?", ["Logistic regression", "K-means clustering", "Random forest classifier", "Linear regression"], 2),
    sc("intermediate", "PyTorch / TensorFlow", "A learning rate that is too high typically causes…", ["Very slow but stable training", "Loss that oscillates or diverges", "Perfect accuracy", "No gradients"], 2),
    sc("intermediate", "scikit-learn", "One-hot encoding is used for…", ["Scaling numeric features", "Categorical features without an order", "Removing missing values", "Text summarisation"], 2),
    sc("intermediate", "Computer vision", "Convolutional neural networks are especially suited to…", ["Tabular accounting data", "Images and spatial data", "Key-value storage", "Sorting lists"], 2),
    ms("intermediate", "ML fundamentals", "Which help with an imbalanced classification dataset? (select all)", ["Class weights", "Resampling (over/under-sampling)", "Choosing metrics like recall / F1", "Deleting the minority class"], [1, 2, 3]),
    tf("beginner", "SQL", "A JOIN combines rows from two tables based on a related column.", true),
    sc("advanced", "MLOps", "A feature store mainly ensures…", ["Faster GPUs", "The same feature definitions are used in training and serving", "Free labelling", "Model compression"], 2),
    sc("advanced", "Cloud (AWS/GCP/Azure)", "To serve a model with unpredictable, spiky traffic you would prefer…", ["A single fixed VM", "Auto-scaling containers / serverless endpoints", "A laptop", "Batch jobs once a week"], 2),
  ],
  "android-app-developer": [
    sc("beginner", "Kotlin", "The Kotlin safe-call operator is…", ["!!", "?.", "::", "->"], 2),
    sc("beginner", "Android", "Which file declares an app's activities and permissions?", ["build.gradle", "AndroidManifest.xml", "strings.xml", "proguard-rules.pro"], 2),
    sc("intermediate", "Android", "Which lifecycle method is called when an Activity becomes visible to the user?", ["onCreate()", "onStart()", "onDestroy()", "onLowMemory()"], 2),
    sc("intermediate", "Jetpack Compose", "In Compose, a LazyColumn is used to…", ["Draw a single image", "Efficiently display a scrollable list", "Store preferences", "Run background jobs"], 2),
    sc("intermediate", "MVVM", "Which survives configuration changes like screen rotation?", ["The Activity instance", "A ViewModel", "Local variables in onCreate", "A Toast"], 2),
    sc("intermediate", "Kotlin", "Kotlin Flow is best described as…", ["A UI layout", "A cold asynchronous stream of values", "A database", "A build tool"], 2),
    sc("intermediate", "Dependency injection", "Hilt is used for…", ["Image loading", "Dependency injection", "Crash reporting", "Animations"], 2),
    sc("intermediate", "Retrofit", "To parse JSON responses into Kotlin data classes with Retrofit you add…", ["A converter factory (e.g. Moshi / Gson / kotlinx)", "A new Activity", "A ContentProvider", "Nothing — it's automatic"], 1),
    ms("intermediate", "Play Store CI/CD", "Which are part of a production release? (select all)", ["A signed release build (AAB)", "Version code increment", "Testing on an internal track", "Shipping a debug build"], [1, 2, 3]),
    tf("beginner", "Android", "Network calls on the main thread throw NetworkOnMainThreadException.", true),
    sc("advanced", "Room", "A Room schema change in a released app requires…", ["Nothing", "A Migration (or a destructive fallback you accept)", "Reinstalling Android Studio", "Changing the package name"], 2),
    sc("advanced", "Performance", "Which tool helps find memory leaks in a debug build?", ["LeakCanary", "Glide", "Timber", "Picasso"], 1),
  ],
  "ios-app-developer": [
    sc("beginner", "Swift", "Which Swift type can hold either a value or nil?", ["Array", "Optional", "Tuple", "Enum only"], 2),
    sc("beginner", "UIKit", "In UIKit, the class that manages a screen of content is…", ["UIView", "UIViewController", "UIWindowScene", "UIColor"], 2),
    sc("intermediate", "Swift", "`struct` differs from `class` in Swift because structs are…", ["Reference types", "Value types (copied on assignment)", "Always global", "Only for protocols"], 2),
    sc("intermediate", "SwiftUI", "Which property wrapper passes a two-way reference to a parent's state?", ["@State", "@Binding", "@Published", "@AppStorage"], 2),
    sc("intermediate", "SwiftUI", "An `ObservableObject` publishes changes to views through…", ["@Published properties", "NotificationCenter only", "Delegates only", "KVO strings"], 1),
    sc("intermediate", "Concurrency", "`async/await` in Swift is used to…", ["Draw layouts", "Write asynchronous code that reads sequentially", "Encrypt data", "Localise strings"], 2),
    sc("intermediate", "REST APIs", "`Codable` in Swift is used to…", ["Animate views", "Encode and decode data such as JSON", "Sign builds", "Manage memory"], 2),
    sc("intermediate", "App Store Connect", "App Store review rejects apps most often for…", ["Using Swift", "Crashes, incomplete metadata or guideline violations", "Dark mode support", "Using SwiftUI"], 2),
    ms("intermediate", "Accessibility", "Which improve iOS accessibility? (select all)", ["VoiceOver labels", "Dynamic Type support", "Sufficient colour contrast", "Tiny tap targets"], [1, 2, 3]),
    tf("beginner", "Swift", "`let` constants cannot be reassigned after initialisation.", true),
    sc("advanced", "Concurrency", "`@MainActor` guarantees that code…", ["Runs faster", "Runs on the main thread", "Runs in the background", "Never throws"], 2),
    sc("advanced", "Performance", "Which Xcode tool profiles CPU, memory and leaks?", ["Interface Builder", "Instruments", "Simulator", "TestFlight"], 2),
  ],
  "quality-analyst": [
    sc("beginner", "Manual & Automated Testing", "A quick check that the main functions work after a new build is…", ["Smoke testing", "Soak testing", "Mutation testing", "Penetration testing"], 1),
    sc("beginner", "Testing", "Black-box testing means testing…", ["With full knowledge of the code", "Behaviour through inputs and outputs without looking at the code", "Only the UI colours", "Only databases"], 2),
    sc("intermediate", "Test design", "For an age field accepting 18–60, boundary value analysis tests…", ["Only 30", "17, 18, 60 and 61", "Only negative numbers", "Random letters"], 2),
    sc("intermediate", "Test design", "Equivalence partitioning means…", ["Testing every possible value", "Grouping inputs that behave the same and testing one from each group", "Pair programming", "Splitting the team"], 2),
    sc("intermediate", "Defect Management", "Severity vs priority: a typo on the home page logo is usually…", ["High severity, high priority", "Low severity, high priority", "High severity, low priority", "Neither"], 2),
    sc("intermediate", "API Testing", "Which tool is commonly used for manual API testing?", ["Figma", "Postman", "Photoshop", "Excel only"], 2),
    sc("intermediate", "Selenium / Cypress / Playwright", "The most robust selector for automated UI tests is usually…", ["An absolute XPath", "A stable test id or accessible role/label", "The 5th div on the page", "Text colour"], 2),
    sc("intermediate", "Performance", "Load testing checks…", ["Spelling", "How the system behaves under expected concurrent users", "Accessibility", "Code style"], 2),
    ms("intermediate", "Testing", "Which belong in the test pyramid's largest (base) layer? (select all)", ["Unit tests", "Fast, isolated tests", "Many end-to-end UI tests", "Manual exploratory sessions"], [1, 2]),
    tf("beginner", "Defect Management", "A bug should be retested after it is fixed before it is closed.", true),
    sc("advanced", "Automation", "Tests pass locally but fail in CI. The first thing to compare is…", ["The laptop brand", "Environment differences: data, config, timing and browser versions", "The tester's name", "Nothing — ignore CI"], 2),
    sc("advanced", "Security", "Entering `' OR 1=1 --` in a login field tests for…", ["XSS", "SQL injection", "CSRF", "Clickjacking"], 2),
  ],
  "ui-ux-designer": [
    sc("beginner", "UX", "A user persona is…", ["A real customer's password", "A research-based profile representing a key user group", "A logo variation", "A colour palette"], 2),
    sc("beginner", "UI", "Visual hierarchy is mainly created with…", ["Random colours", "Size, weight, colour, spacing and position", "More animations", "Longer text"], 2),
    sc("intermediate", "Figma", "Auto Layout in Figma is used to…", ["Export code", "Make frames resize and space content automatically", "Store fonts", "Record prototypes"], 2),
    sc("intermediate", "UX", "Wireframes are primarily for…", ["Final visual polish", "Structure and layout before visual design", "Printing", "Branding only"], 2),
    sc("intermediate", "User Research", "A usability test should ask participants to…", ["Rate the colours only", "Complete realistic tasks while thinking aloud", "Redesign the product", "Read the documentation first"], 2),
    sc("intermediate", "Accessibility", "Why shouldn't colour alone convey status (e.g. red = error)?", ["It is slower to load", "Colour-blind users may not perceive it", "Browsers block it", "It breaks SEO"], 2),
    sc("intermediate", "Design Systems", "Component variants in a design system help…", ["Create one-off screens", "Keep states (default, hover, disabled) consistent and reusable", "Increase file size", "Avoid documentation"], 2),
    sc("intermediate", "UX", "The 8-point grid system is used for…", ["Pricing", "Consistent spacing and sizing", "Font licensing", "User interviews"], 2),
    ms("intermediate", "UX", "Which are among Nielsen's usability heuristics? (select all)", ["Visibility of system status", "Error prevention", "Consistency and standards", "Maximum decoration"], [1, 2, 3]),
    tf("beginner", "Accessibility", "Touch targets should be large enough to tap comfortably (around 44–48 px).", true),
    sc("advanced", "User Research", "A/B testing is best for…", ["Discovering why users struggle", "Measuring which of two variants performs better on a metric", "Replacing user interviews", "Designing a logo"], 2),
    sc("advanced", "HTML/CSS Basics", "Designing mobile-first means…", ["Only designing for phones", "Starting with the smallest screen and progressively enhancing for larger ones", "Ignoring desktop", "Using fixed widths"], 2),
  ],
  "business-development-manager": [
    sc("beginner", "B2B Sales", "The sales funnel stage right after lead qualification is usually…", ["Onboarding", "Discovery / needs analysis", "Renewal", "Invoicing"], 2),
    sc("beginner", "CRM Tools", "Which is a CRM platform?", ["Figma", "HubSpot / Salesforce / Zoho CRM", "Photoshop", "Jenkins"], 2),
    sc("intermediate", "Lead Generation", "Account-based marketing (ABM) targets…", ["Anyone on the internet", "A defined list of high-value accounts with tailored outreach", "Only existing customers", "Only small businesses"], 2),
    sc("intermediate", "B2B Sales", "In discovery calls, the best ratio is usually…", ["Mostly you talking", "Mostly the client talking while you ask questions", "No questions", "Only pricing"], 2),
    sc("intermediate", "Negotiation", "Anchoring in negotiation refers to…", ["Ending the call", "The first number stated, which influences the final outcome", "Signing the contract", "Offering discounts"], 2),
    sc("intermediate", "B2B Sales", "Customer lifetime value (CLV) helps decide…", ["Office rent", "How much you can spend to acquire and retain a customer", "Employee salaries", "Logo colours"], 2),
    sc("intermediate", "Proposal Writing", "A statement of work (SOW) should clearly define…", ["Only the price", "Scope, deliverables, timeline, assumptions and acceptance criteria", "The company history", "Team hobbies"], 2),
    sc("intermediate", "Lead Generation", "A good cold email is…", ["Long and generic", "Short, personalised, with one clear ask", "Full of attachments", "Sent to everyone at once"], 2),
    ms("intermediate", "CRM Tools", "Which should be logged in the CRM after a client call? (select all)", ["Key needs and objections", "Next step with a date", "Decision makers involved", "Unrelated personal gossip"], [1, 2, 3]),
    tf("beginner", "B2B Sales", "Upselling means offering a customer a higher-value option or add-on.", true),
    sc("advanced", "Forecasting", "Weighted pipeline value is calculated by…", ["Adding all deal values", "Multiplying each deal's value by its stage win probability and summing", "Counting deals", "Averaging deal age"], 2),
    sc("advanced", "B2B Sales", "A prospect says \"it's too expensive\". The best first response is…", ["Drop the price 20%", "Explore what value they compare it against and the cost of not solving the problem", "End the conversation", "Argue"], 2),
  ],
  "business-analyst": [
    sc("beginner", "Requirements Gathering", "A functional requirement describes…", ["How fast the system must be", "What the system must do", "The office layout", "The budget"], 2),
    sc("beginner", "Requirements Gathering", "Which is a non-functional requirement?", ["Users can reset their password", "Pages load in under 2 seconds", "Admins can export reports", "Customers can add items to a cart"], 2),
    sc("intermediate", "Process Mapping", "A swimlane diagram shows…", ["Database tables", "Process steps grouped by who performs them", "Server architecture", "Colour themes"], 2),
    sc("intermediate", "Requirements Gathering", "Gap analysis compares…", ["Two competitors' logos", "The current state with the desired future state", "Two invoices", "Test cases"], 2),
    sc("intermediate", "User Stories", "INVEST criteria describe a good user story as…", ["Internal, Vague, Expensive…", "Independent, Negotiable, Valuable, Estimable, Small, Testable", "Immediate, Necessary, Visual…", "None"], 2),
    sc("intermediate", "Stakeholder Management", "A RACI matrix clarifies…", ["Budgets", "Who is Responsible, Accountable, Consulted and Informed", "Server roles", "Test coverage"], 2),
    sc("intermediate", "SQL Basics", "Which SQL keyword sorts results?", ["GROUP BY", "ORDER BY", "WHERE", "JOIN"], 2),
    sc("intermediate", "Documentation", "A BRD (Business Requirements Document) mainly captures…", ["Source code", "Business needs, objectives, scope and requirements", "Marketing slogans", "Salary data"], 2),
    ms("intermediate", "Analysis", "Which help find root causes? (select all)", ["5 Whys", "Fishbone (Ishikawa) diagram", "Pareto analysis", "Guessing the first idea"], [1, 2, 3]),
    tf("beginner", "User Stories", "Acceptance criteria should be testable.", true),
    sc("advanced", "Agile", "In Scrum, the BA most often supports the…", ["Scrum Master with ceremonies only", "Product Owner with backlog refinement and requirements", "Finance team", "Marketing team"], 2),
    sc("advanced", "Stakeholder Management", "Two stakeholders give conflicting requirements. You should…", ["Pick the louder one", "Document both, clarify goals and facilitate a decision with the owner", "Implement both", "Ignore both"], 2),
  ],
  "project-manager": [
    sc("beginner", "Planning", "A work breakdown structure (WBS) splits a project into…", ["Invoices", "Smaller, manageable deliverables and work packages", "Teams only", "Risks"], 2),
    sc("beginner", "Planning", "A milestone is…", ["A task that takes a week", "A significant point or event with zero duration", "A budget line", "A meeting"], 2),
    sc("intermediate", "Planning", "The critical path is…", ["The cheapest sequence of tasks", "The longest sequence of dependent tasks that determines the end date", "The list of risks", "The QA process"], 2),
    sc("intermediate", "Agile / Scrum", "Velocity in Scrum measures…", ["Team happiness", "Work completed per sprint (e.g. story points)", "Bug count", "Budget spent"], 2),
    sc("intermediate", "Agile / Scrum", "The Definition of Done ensures…", ["Every item meets agreed quality criteria before it counts as complete", "Tasks are assigned", "Meetings end on time", "The budget is approved"], 1),
    sc("intermediate", "Budgeting", "SPI below 1.0 means the project is…", ["Ahead of schedule", "Behind schedule", "Under budget", "Over budget"], 2),
    sc("intermediate", "Risk Management", "Risk mitigation means…", ["Ignoring the risk", "Reducing the probability or impact of a risk", "Transferring blame", "Closing the project"], 2),
    sc("intermediate", "Kanban", "WIP limits in Kanban help to…", ["Increase multitasking", "Improve flow and expose bottlenecks", "Hire more people", "Skip testing"], 2),
    ms("intermediate", "Stakeholder Management", "Which belong in a project kickoff? (select all)", ["Goals and scope", "Roles and responsibilities", "Timeline and milestones", "Final invoice"], [1, 2, 3]),
    tf("beginner", "Scope", "Scope creep is uncontrolled growth in project scope.", true),
    sc("advanced", "Estimation", "The PERT estimate uses…", ["(Optimistic + 4 × Most likely + Pessimistic) / 6", "Optimistic only", "The average of two guesses", "Last project's total"], 1),
    sc("advanced", "Stakeholder Management", "A key stakeholder keeps missing reviews. Best action?", ["Proceed without them silently", "Understand their constraints and agree a lighter review format and escalation path", "Cancel the project", "Complain publicly"], 2),
  ],
  "bid-executive": [
    sc("beginner", "Pre-Sales", "An RFP is…", ["A Request for Proposal from a potential client", "A refund policy", "A resource plan", "A risk form"], 1),
    sc("beginner", "Proposal Writing", "An executive summary should be…", ["The longest section", "A short overview of the problem, solution and value", "A list of employees", "Optional always"], 2),
    sc("intermediate", "Pre-Sales", "Before bidding, you should confirm…", ["Only the client's name", "Budget, timeline, scope and whether we can deliver it well", "The weather", "Nothing"], 2),
    sc("intermediate", "Upwork / Freelancer", "On Upwork, a job's client history helps you judge…", ["Font preferences", "Payment reliability, hiring rate and past feedback", "Their age", "Their office"], 2),
    sc("intermediate", "Proposal Writing", "Case studies in a proposal are most effective when they…", ["Are generic", "Match the client's industry or problem with measurable results", "Are very long", "Use no numbers"], 2),
    sc("intermediate", "Pricing", "A fixed-price bid carries more risk for us when…", ["Scope is clearly defined", "Requirements are vague or likely to change", "The client is friendly", "The timeline is long"], 2),
    sc("intermediate", "Client Communication", "After a discovery call you should send…", ["Nothing", "A short recap with understanding, open questions and next steps", "An invoice", "A contract immediately"], 2),
    sc("intermediate", "Pre-Sales", "A win/loss analysis is used to…", ["Blame the team", "Learn why bids were won or lost and improve future ones", "Delete old bids", "Raise prices"], 2),
    ms("intermediate", "Proposal Writing", "Which should a proposal's timeline include? (select all)", ["Milestones", "Deliverables per phase", "Client dependencies", "Team vacation plans"], [1, 2, 3]),
    tf("beginner", "MS Office", "Proposals should be proof-read for spelling and formatting before sending.", true),
    sc("advanced", "Pricing", "A client asks for a quote but the scope is unclear. Best approach?", ["Quote very low to win", "Offer a paid discovery phase or a ranged estimate with stated assumptions", "Refuse to respond", "Quote without assumptions"], 2),
    sc("advanced", "Pre-Sales", "A go / no-go decision on a bid should mainly consider…", ["Only the bid deadline", "Fit with our capabilities, win probability, value and risk", "How many competitors exist only", "Personal interest"], 2),
  ],
  "accounts-manager": [
    sc("beginner", "Accounting", "The accounting equation is…", ["Assets = Liabilities + Equity", "Revenue = Expenses", "Cash = Profit", "Assets = Revenue − Expenses"], 1),
    sc("beginner", "Accounting", "Which financial statement shows profit or loss over a period?", ["Balance sheet", "Profit & Loss (income) statement", "Bank statement", "Trial balance"], 2),
    sc("intermediate", "Accounting", "Accrual accounting records revenue when…", ["Cash is received", "It is earned, regardless of when cash is received", "The year ends", "The client asks"], 2),
    sc("intermediate", "GST & Compliance", "For an inter-state sale in India, the GST charged is…", ["CGST + SGST", "IGST", "No GST", "Customs duty"], 2),
    sc("intermediate", "GST & Compliance", "Input Tax Credit (ITC) allows a business to…", ["Avoid filing returns", "Offset GST paid on purchases against GST on sales", "Claim salaries", "Skip invoices"], 2),
    sc("intermediate", "Compliance", "TDS stands for…", ["Tax Deducted at Source", "Total Daily Sales", "Tax Declaration Statement", "Trade Discount Scheme"], 1),
    sc("intermediate", "Accounting", "A trial balance is used to check that…", ["Profit is high", "Total debits equal total credits", "Invoices are paid", "Stock is counted"], 2),
    sc("intermediate", "Invoicing", "An ageing report helps you…", ["Track staff ages", "See overdue receivables by how long they are outstanding", "Plan holidays", "Value fixed assets"], 2),
    ms("intermediate", "Accounting", "Which are current assets? (select all)", ["Cash", "Trade receivables", "Inventory", "Office building"], [1, 2, 3]),
    tf("beginner", "Tally / QuickBooks", "A credit note is issued to reduce the amount owed on an earlier invoice.", true),
    sc("advanced", "Accounting", "Prepaid rent for next year is recorded as…", ["An expense this year", "A current asset (prepaid expense)", "Revenue", "A liability"], 2),
    sc("advanced", "MS Excel", "To match a bank statement against the ledger quickly in Excel you would use…", ["Manual scrolling", "Lookups (XLOOKUP / VLOOKUP) or conditional matching", "Word art", "Charts only"], 2),
  ],
  "mis-executive": [
    sc("beginner", "MS Excel", "Which Excel feature highlights cells meeting a rule?", ["Freeze panes", "Conditional formatting", "Merge cells", "Page layout"], 2),
    sc("beginner", "MS Excel", "Which function counts cells that meet one condition?", ["COUNT", "COUNTIF", "SUM", "LEN"], 2),
    sc("intermediate", "MS Excel", "Absolute reference $A$1 means…", ["The reference changes when copied", "The reference stays fixed when copied", "The cell is hidden", "The value is text"], 2),
    sc("intermediate", "Power BI / Tableau", "In Power BI, relationships between tables are defined in…", ["The report canvas only", "The data model (model view)", "Excel", "The theme file"], 2),
    sc("intermediate", "Report Automation", "Power Query is mainly used to…", ["Send emails", "Extract, clean and transform data before reporting", "Draw charts", "Protect workbooks"], 2),
    sc("intermediate", "SQL", "Which SQL returns the total sales per region?", ["SELECT region, SUM(amount) FROM sales GROUP BY region", "SELECT SUM(region) FROM sales", "SELECT * FROM sales WHERE SUM(amount)", "SELECT region FROM sales ORDER BY amount"], 1),
    sc("intermediate", "Data Validation", "Duplicate customer rows in a report should first be…", ["Deleted blindly", "Identified by a key and investigated at the source", "Summed", "Hidden"], 2),
    sc("intermediate", "Reporting", "A KPI should be…", ["As many metrics as possible", "Specific, measurable and tied to a business goal", "Only financial", "Changed every week"], 2),
    ms("intermediate", "Power BI / Tableau", "Which charts suit a trend over time? (select all)", ["Line chart", "Area chart", "Column chart by month", "Pie chart of 30 dates"], [1, 2, 3]),
    tf("beginner", "MS Excel", "A PivotTable must be refreshed to reflect changes in its source data.", true),
    sc("advanced", "Power BI / Tableau", "Row-level security in Power BI is used to…", ["Speed up visuals", "Restrict which rows each user can see", "Change colours", "Schedule refresh"], 2),
    sc("advanced", "Data Validation", "Before publishing a monthly MIS, the best reconciliation is…", ["None", "Comparing report totals with the source system / finance figures", "Checking fonts", "Asking a colleague to guess"], 2),
  ],
  "hr-executive": [
    sc("beginner", "Recruitment", "Sourcing candidates means…", ["Paying salaries", "Finding and attracting potential candidates", "Running payroll", "Exit interviews"], 2),
    sc("beginner", "HR Compliance", "An offer letter should state…", ["Only the start date", "Role, compensation, joining date and key terms", "The candidate's hobbies", "Company gossip"], 2),
    sc("intermediate", "Recruitment", "Competency-based interview questions ask candidates to…", ["Guess answers", "Describe past situations showing a skill (e.g. STAR)", "Solve riddles only", "Share salary history only"], 2),
    sc("intermediate", "Recruitment", "Time-to-hire measures…", ["Employee tenure", "Days from job opening (or application) to offer acceptance", "Training hours", "Leave balance"], 2),
    sc("intermediate", "HRMS / ATS", "An HRMS typically manages…", ["Source code", "Employee records, attendance, leave and payroll", "Marketing campaigns", "Server logs"], 2),
    sc("intermediate", "HR Compliance", "The POSH Act in India requires organisations above 10 employees to…", ["Offer gym memberships", "Constitute an Internal Committee for harassment complaints", "Pay bonuses", "Run hackathons"], 2),
    sc("intermediate", "Employee Engagement", "eNPS measures…", ["Payroll accuracy", "How likely employees are to recommend the company as a workplace", "Hiring speed", "Training cost"], 2),
    sc("intermediate", "Onboarding", "A probation review is used to…", ["Decide promotions for everyone", "Confirm fit and performance before confirmation", "Replace onboarding", "Set holidays"], 2),
    ms("intermediate", "HR Compliance", "Which are statutory in India for eligible employees? (select all)", ["Provident Fund (PF)", "ESI (where applicable)", "Gratuity after eligibility", "Free lunches"], [1, 2, 3]),
    tf("beginner", "Recruitment", "Structured interviews with the same questions for all candidates reduce bias.", true),
    sc("advanced", "Employee Relations", "An employee's performance drops suddenly. The first step is…", ["Issue a warning letter", "Have a private conversation to understand causes and agree support", "Cut their salary", "Inform the whole team"], 2),
    sc("advanced", "Exit", "Exit interviews are most useful when…", ["Skipped for senior staff", "Findings are analysed across leavers and acted on", "Only recorded on paper", "Used to argue with the employee"], 2),
  ],
  "technical-content-writer": [
    sc("beginner", "Editing", "Which is correct?", ["Its a good API.", "It's a good API.", "Its' a good API.", "It is' a good API."], 2),
    sc("beginner", "Technical Writing", "Numbered lists are best for…", ["Unordered ideas", "Step-by-step instructions", "Quotes", "Headlines"], 2),
    sc("intermediate", "Technical Writing", "Documentation for developers should include…", ["Only marketing claims", "Working code samples, parameters and expected responses", "Stock photos", "Company history"], 2),
    sc("intermediate", "SEO Writing", "An H1 heading should…", ["Appear many times per page", "State the page's main topic once", "Contain only the brand name", "Be hidden"], 2),
    sc("intermediate", "SEO Writing", "Internal linking helps SEO by…", ["Slowing the site", "Distributing authority and helping crawlers find related pages", "Hiding content", "Removing keywords"], 2),
    sc("intermediate", "Content Strategy", "A content brief usually contains…", ["Only a title", "Audience, goal, keywords, outline and references", "The writer's salary", "Nothing"], 2),
    sc("intermediate", "Editing", "\"Utilise\" → \"use\" is an example of…", ["Keyword stuffing", "Plain-language editing", "Passive voice", "Plagiarism"], 2),
    sc("intermediate", "Technical Writing", "A changelog entry should say…", ["Fixed stuff", "What changed, why it matters and any action users must take", "Nothing", "Only the version number"], 2),
    ms("intermediate", "SEO Writing", "Which improve a blog post's search performance? (select all)", ["Matching search intent", "Descriptive title and meta description", "Helpful internal links", "Copying competitors' text"], [1, 2, 3]),
    tf("beginner", "Ethics", "Copying another site's article without permission and attribution is plagiarism.", true),
    sc("advanced", "Content Strategy", "Content that stays relevant for years is called…", ["Viral content", "Evergreen content", "Clickbait", "Gated content"], 2),
    sc("advanced", "Technical Writing", "For a complex feature, the best documentation structure is often…", ["One very long page", "Concepts → quick start → task guides → reference", "Reference only", "FAQ only"], 2),
  ],
  "digital-marketing": [
    sc("beginner", "Digital Marketing", "CTR stands for…", ["Cost To Revenue", "Click-Through Rate", "Customer Time Retention", "Content Tracking Report"], 2),
    sc("beginner", "SEO", "Backlinks are…", ["Links on your own menu", "Links from other websites to yours", "Broken links", "Paid ads"], 2),
    sc("intermediate", "Google Ads", "Negative keywords are used to…", ["Increase impressions", "Stop ads showing for irrelevant searches", "Lower the budget automatically", "Target competitors"], 2),
    sc("intermediate", "Google Ads", "ROAS is calculated as…", ["Clicks ÷ impressions", "Revenue from ads ÷ ad spend", "Cost ÷ clicks", "Leads ÷ visitors"], 2),
    sc("intermediate", "Meta Ads", "The Meta Pixel / Conversions API is used to…", ["Design creatives", "Track website actions for measurement and optimisation", "Schedule posts", "Write captions"], 2),
    sc("intermediate", "Google Analytics", "UTM parameters are used to…", ["Speed up pages", "Identify the source, medium and campaign of traffic", "Block bots", "Compress images"], 2),
    sc("intermediate", "SEO", "Core Web Vitals measure…", ["Keyword count", "Loading, interactivity and visual stability of pages", "Social followers", "Backlink count"], 2),
    sc("intermediate", "Email Marketing", "A/B testing an email subject line measures differences mainly in…", ["Bounce rate", "Open rate", "Unsubscribe laws", "Server load"], 2),
    ms("intermediate", "Digital Marketing", "Which belong in a landing page that converts? (select all)", ["One clear call-to-action", "Proof such as testimonials or logos", "Message matching the ad", "Many unrelated links"], [1, 2, 3]),
    tf("beginner", "Social Media Marketing", "Organic reach is the audience you reach without paying for ads.", true),
    sc("advanced", "Google Ads", "Conversions are dropping but clicks are steady. The first thing to check is…", ["Logo colours", "Landing page and conversion tracking", "Number of campaigns", "Ad fonts"], 2),
    sc("advanced", "Digital Marketing", "Attribution modelling helps you…", ["Write ads", "Understand which touchpoints contribute to conversions", "Buy domains", "Design logos"], 2),
  ],
};

// 20 questions per role: the original 8 (7 knowledge + 1 written) followed by 12 more knowledge questions. Appending
// keeps every existing question's position — and therefore its id — unchanged.
for (const job of CAREER_TESTS) job.questions.push(...EXTRA_QUESTIONS[job.slug]);

/** A role-specific written answer for applicants (the generic seeder's sample is about release emails). */
function respondFor(q, skill) {
  if (q.type !== "long_answer") return respond(q, skill);
  if (rng() < 0.08) return null;
  return { text: rng() < skill ? q.sample : "I would discuss it with the team and decide the best approach." };
}

export async function seedOtsCareers(db, { actorId = null, evaluatorId = null } = {}) {
  for (const c of ["ots_questions", "ots_tests", "ots_dispatches", "ots_assignments", "ots_attempts", "ots_categories", "ots_activity_logs"]) await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });

  // Categories: one test category for screening, one question category per role.
  const testCatName = "Recruitment Screening";
  const existingTestCat = await db.collection("ots_categories").findOne({ kind: "test", name: testCatName, deletedAt: null, _id: { $not: new RegExp(`^${D}`) } });
  const testCatId = existingTestCat?._id ?? `${D}tc-screening`;
  const cats = existingTestCat ? [] : [{ _id: testCatId, kind: "test", name: testCatName, description: "Screening tests for roles on the careers page.", ...stamp(at(45), actorId) }];
  const qCat = {};
  for (const job of CAREER_TESTS) {
    const existing = await db.collection("ots_categories").findOne({ kind: "question", name: job.title, deletedAt: null, _id: { $not: new RegExp(`^${D}`) } });
    qCat[job.slug] = existing?._id ?? `${D}qc-${job.slug}`;
    if (!existing) cats.push({ _id: qCat[job.slug], kind: "question", name: job.title, description: `Questions for the ${job.title} role (${job.category}).`, ...stamp(at(45), actorId) });
  }
  if (cats.length) await db.collection("ots_categories").insertMany(cats);

  const questions = [];
  const tests = [];
  const dispatches = [];
  const assignments = [];
  const attempts = [];
  const logs = [];
  let logSeq = 0;
  const log = (d, action, entity, entityId, entityLabel, testId, summary, by = actorId) => logs.push({ _id: `${D}log-${++logSeq}`, actorId: by ?? "system", actorEmail: null, action, entity, entityId, entityLabel, testId, summary, metadata: null, createdAt: d });

  let qn = 0;
  for (const [ti, job] of CAREER_TESTS.entries()) {
    const qs = job.questions.map((q) => {
      qn += 1;
      const doc = {
        _id: `${D}q-${job.slug}-${qn}`,
        code: `Q-C${String(qn).padStart(4, "0")}`,
        type: q.type,
        prompt: q.prompt,
        media: null,
        categoryId: qCat[job.slug],
        subject: job.title,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks ?? (q.difficulty === "advanced" ? 2 : 1),
        negativeMarks: 0,
        explanation: q.explanation ?? "",
        tags: [job.slug, "screening"],
        status: "active",
        definition: q.definition,
        version: 1,
        ...stamp(at(44 - ti), actorId),
      };
      questions.push(doc);
      return { doc, src: q };
    });
    const objective = qs.filter((x) => x.src.type !== "long_answer");
    const writtenQ = qs.filter((x) => x.src.type === "long_answer");
    const test = {
      _id: `${D}t-${job.slug}`,
      code: `TST-C${String(ti + 1).padStart(3, "0")}`,
      name: `${job.title} Screening Test`,
      description: `Pre-interview screening for the ${job.title} role (${job.category}) — role knowledge plus one written response. Questions follow the skills listed on the careers page.`,
      categoryId: testCatId,
      testType: "screening",
      subject: job.title,
      departmentIds: [],
      designationIds: [],
      difficulty: "mixed",
      instructions: `This test is part of your application for ${job.title}. ${job.minutes} minutes, one attempt. Answer the written question in your own words — it is reviewed by the hiring team, who share results with you after evaluation.`,
      tags: [job.slug, "hiring"],
      language: "English",
      status: "published",
      config: CONFIG({ durationMinutes: job.minutes, passingPercentage: 60, resultRelease: "manual", resultDetail: "score", showExplanations: false, randomizeOptions: true, security: { requireFullscreen: false, detectTabSwitch: true, blockCopyPaste: true, blockRightClick: true, singleSession: true, maxViolations: 5 } }),
      sections: [section(`${D}sec-${job.slug}-1`, "Role knowledge", objective.map((x) => x.doc._id)), section(`${D}sec-${job.slug}-2`, "Written response", writtenQ.map((x) => x.doc._id))],
      certificate: { enabled: false, title: "", validityMonths: null },
      publishedAt: at(40 - ti),
      publishedBy: actorId,
      closedAt: null,
      archivedAt: null,
      paperStats: { questionCount: qs.length, servedCount: qs.length, totalMarks: qs.reduce((s, x) => s + x.doc.marks, 0), marksVary: false },
      ...stamp(at(42 - ti), actorId),
    };
    tests.push(test);
    log(test.createdAt, "create", "test", test._id, test.name, test._id, `${test.code} · screening`);
    log(test.publishedAt, "publish", "test", test._id, test.name, test._id, test.code);

    // Real applicants for this role, past the "new" stage.
    const apps = await db
      .collection("career_applications")
      .find({ positionSlug: job.slug, status: { $in: ["under_review", "shortlisted", "interview_scheduled", "selected", "hired"] } }, { projection: { name: 1, status: 1 } })
      .limit(40)
      .toArray();
    if (apps.length === 0) continue;
    const dispatch = {
      _id: `${D}dsp-${job.slug}`,
      testId: test._id,
      targets: [{ type: "applicant_position", ids: [job.slug] }],
      targetSummary: `Applicants by Position: ${job.title}`,
      applicantStatuses: ["under_review", "shortlisted", "interview_scheduled", "selected", "hired"],
      startAt: null,
      dueAt: new Date(NOW + 5 * DAY),
      maxAttempts: null,
      priority: "high",
      instructions: "Please complete this before your role interview.",
      notify: true,
      resultRelease: null,
      resultDetail: null,
      certificateEligible: false,
      allowLateStart: false,
      created: apps.length,
      skipped: 0,
      ...stamp(at(20 - (ti % 10)), actorId),
    };
    dispatches.push(dispatch);
    log(dispatch.createdAt, "assign", "assignment", dispatch._id, test.name, test._id, `${apps.length} assigned → ${dispatch.targetSummary}`);

    for (const app of apps) {
      const ref = { kind: "applicant", id: app._id.toString() };
      const a = {
        _id: `${D}asg-${assignments.length + 1}`,
        dispatchId: dispatch._id,
        testId: test._id,
        candidate: ref,
        candidateKey: `applicant:${ref.id}`,
        candidateLabel: app.name,
        startAt: null,
        dueAt: dispatch.dueAt,
        maxAttempts: null,
        extraAttempts: 0,
        priority: "high",
        instructions: dispatch.instructions,
        allowLateStart: false,
        resultRelease: null,
        resultDetail: null,
        certificateEligible: false,
        status: "assigned",
        attemptsUsed: 0,
        activeAttemptId: null,
        result: null,
        resultPublishedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        remindedDueAt: null,
        expiredNotifiedAt: null,
        ...stamp(dispatch.createdAt, actorId),
      };
      assignments.push(a);
      // Stage → test progress: shortlisted / under review haven't taken it yet; later stages have.
      if (["under_review", "shortlisted"].includes(app.status)) continue;
      const strong = ["selected", "hired"].includes(app.status);
      const skill = strong ? 0.8 + rng() * 0.18 : 0.5 + rng() * 0.35;
      const startedAt = at(rint(2, 16), rint(9, 18), rint(0, 59));
      const submittedAt = new Date(startedAt.getTime() + Math.round(job.minutes * (0.5 + rng() * 0.45)) * 60000);
      const paper = [];
      test.sections.forEach((sec, si) =>
        sec.questionIds.forEach((id) => {
          const { doc, src } = qs.find((x) => x.doc._id === id);
          paper.push({ qid: doc._id, code: doc.code, section: si, type: doc.type, prompt: doc.prompt, media: null, difficulty: doc.difficulty, subject: doc.subject, topic: doc.topic, categoryId: doc.categoryId, explanation: doc.explanation, definition: doc.definition, view: publicView(src, true), marks: doc.marks, negativeMarks: 0, autoGradable: autoGradable(src), outcome: null, _src: src });
        })
      );
      const answers = paper.map((it) => ({ response: respondFor(it._src, skill), flagged: false, visited: true, timeMs: rint(20, 160) * 1000, savedAt: submittedAt }));
      // Hired / selected candidates' written answers were marked; interview-stage ones are split.
      const evaluate = strong || rng() < 0.5;
      paper.forEach((it, i) => {
        it.outcome = grade(it._src, answers[i].response, it.marks, 0);
        if (it.outcome.status === "pending" && evaluate) {
          const m = Math.round(it.marks * (strong ? 0.7 + rng() * 0.3 : 0.3 + rng() * 0.5) * 4) / 4;
          it.outcome = { status: m >= it.marks ? "correct" : "partial", awarded: m, auto: false, evaluatedBy: evaluatorId, evaluatedAt: new Date(submittedAt.getTime() + DAY), comment: strong ? "Clear, structured answer." : "Covers the basics; missing specifics.", overridden: false };
        }
        delete it._src;
      });
      const result = computeResult(paper, test.sections, test.config, startedAt, submittedAt);
      const status = result.pending > 0 ? "pending_evaluation" : "evaluated";
      // Hiring team published results for candidates who progressed to an offer.
      const published = status === "evaluated" && strong;
      const att = {
        _id: `${D}att-${attempts.length + 1}`,
        assignmentId: a._id,
        testId: test._id,
        candidate: ref,
        candidateKey: a.candidateKey,
        attemptNo: 1,
        status,
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + job.minutes * 60000),
        softDeadlineAt: null,
        submittedAt,
        submitReason: "MANUAL",
        sessionId: "demo",
        seed: rint(1, 1e9),
        config: test.config,
        testName: test.name,
        sectionMode: "free",
        sections: test.sections.map((s) => ({ title: s.title, timeLimitSec: null, startedAt, deadlineAt: null, locked: true })),
        currentSection: 0,
        cursor: paper.length - 1,
        paper,
        answers,
        events: rng() < 0.2 ? [{ type: "tab_hidden", at: new Date(startedAt.getTime() + 240000), detail: "Tab hidden / minimised" }] : [],
        violations: 0,
        client: { startIp: `49.207.${rint(0, 255)}.${rint(1, 254)}`, startUserAgent: "Mozilla/5.0 (demo)", lastIp: null, channel: "portal" },
        result,
        evaluatedAt: status === "evaluated" ? new Date(submittedAt.getTime() + DAY) : null,
        resultPublishedAt: published ? new Date(submittedAt.getTime() + 2 * DAY) : null,
        takenBy: "demo",
        createdAt: startedAt,
        updatedAt: submittedAt,
      };
      att.violations = att.events.length;
      attempts.push(att);
      a.attemptsUsed = 1;
      a.startedAt = startedAt;
      a.result = status === "evaluated" ? { attemptId: att._id, score: result.finalScore, total: result.totalMarks, percentage: result.percentage, passed: result.passed, policy: "highest", attemptsCounted: 1 } : null;
      a.status = status === "pending_evaluation" ? "submitted" : published ? "completed" : "evaluated";
      a.resultPublishedAt = att.resultPublishedAt;
      a.completedAt = att.resultPublishedAt;
      log(startedAt, "start", "attempt", att._id, `${app.name} · ${test.name}`, test._id, "Attempt 1 started", null);
      log(submittedAt, "submit", "attempt", att._id, `${test.name} · attempt 1`, test._id, "MANUAL", null);
      if (status === "evaluated") log(att.evaluatedAt, "result_generated", "result", att._id, `${app.name} · ${test.name}`, test._id, `Attempt 1: ${result.finalScore}/${result.totalMarks} (${result.percentage}%) — ${result.passed ? "passed" : "not passed"}`, evaluatorId);
      if (published) log(att.resultPublishedAt, "result_published", "result", att._id, `${app.name} · ${test.name}`, test._id, "Published by staff");
    }
  }

  await db.collection("ots_questions").insertMany(questions);
  await db.collection("ots_tests").insertMany(tests);
  if (dispatches.length) await db.collection("ots_dispatches").insertMany(dispatches);
  if (assignments.length) await db.collection("ots_assignments").insertMany(assignments);
  if (attempts.length) await db.collection("ots_attempts").insertMany(attempts);
  if (logs.length) await db.collection("ots_activity_logs").insertMany(logs);

  return {
    roles: CAREER_TESTS.length,
    questions: questions.length,
    tests: tests.length,
    rolesWithApplicants: dispatches.length,
    assignments: assignments.length,
    attempts: attempts.length,
    pendingEvaluation: attempts.filter((x) => x.status === "pending_evaluation").length,
  };
}
