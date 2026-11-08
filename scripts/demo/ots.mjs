// Online Test System (OTS) demo data: staff logins for every OTS role, an applicant and a student portal login, test and
// question categories, a ~45-question bank covering every question type, eight tests across the whole lifecycle
// (draft → published → active → closed → archived), assignments to a department, a role, individual employees, an
// applicant and a TMS batch, and historical attempts (auto-graded, some awaiting manual evaluation, a timeout, a
// security auto-submission), results, certificates and an activity log.
//
// People are NEVER invented for OTS's sake beyond the demo logins: it reuses the HRMS departments / designations /
// employees, Careers applications and TMS batches / students already in the database (creating a minimal org only when
// HRMS or TMS is empty), exactly as the app resolves them live.
//
// Idempotent: every OTS row has a `demo-ots-` id and is replaced on each run.
import { ObjectId } from "mongodb";
import { hashPassword, makeRng, audit } from "./lib.mjs";
import { seedOtsCareers } from "./ots-careers.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-ots-";
const DAY = 86400000;
const NOW = Date.now();
const rng = makeRng(20260926);
const rint = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
const chance = (p) => rng() < p;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const at = (daysAgo, hour = 11, min = 0) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
};
const stamp = (d, by = null) => ({ createdAt: d, updatedAt: d, createdBy: by, updatedBy: by, deletedAt: null });
const r2 = (n) => Math.round(n * 100) / 100;

export const OTS_DEMO_ACCOUNTS = [
  { email: "demo.ots.admin@example.com", label: "OTS Admin (everything)", roles: ["ots_admin"], dept: null },
  { email: "demo.ots.manager@example.com", label: "OTS Manager (publish / assign / results)", roles: ["ots_manager", "employee"], dept: "Engineering" },
  { email: "demo.ots.author@example.com", label: "OTS Author (tests + question bank)", roles: ["ots_author", "employee"], dept: "Engineering" },
  { email: "demo.ots.evaluator@example.com", label: "OTS Evaluator (marks subjective answers)", roles: ["ots_evaluator", "employee"], dept: "Engineering" },
  { email: "demo.ots.employee@example.com", label: "Employee — Engineering (takes tests)", roles: ["employee"], dept: "Engineering" },
  { email: "demo.ots.sales@example.com", label: "Employee — Sales (takes tests)", roles: ["employee"], dept: "Sales" },
];
export const OTS_PORTAL_ACCOUNTS = [
  { email: "demo.ots.applicant@example.com", label: "Job applicant (Portal → Assessments)", role: "job_applicant" },
  { email: "demo.ots.student@example.com", label: "Trainee student (Portal → Tests & Exams)", role: "trainee" },
];

// ── Question bank ───────────────────────────────────────────────────────────
const opts = (...texts) => texts.map((text, i) => ({ id: `o${i + 1}`, text }));
const choice = (cat, subject, topic, difficulty, prompt, options, correct, extra = {}) => ({ type: "single_choice", cat, subject, topic, difficulty, prompt, definition: { options: opts(...options), correct: correct.map((c) => `o${c}`) }, ...extra });

const QUESTIONS = [
  // JavaScript — fundamentals (beginner / intermediate)
  choice("JavaScript", "JavaScript", "Variables", "beginner", "Which keyword declares a block-scoped variable that cannot be reassigned?", ["var", "let", "const", "static"], [3], { explanation: "`const` creates a block-scoped binding that cannot be reassigned (the value itself may still be mutable)." }),
  choice("JavaScript", "JavaScript", "Types", "beginner", "What does `typeof null` return?", ["\"null\"", "\"object\"", "\"undefined\"", "\"number\""], [2], { explanation: "A long-standing quirk of the language: typeof null is \"object\"." }),
  choice("JavaScript", "JavaScript", "Arrays", "beginner", "Which array method returns a NEW array with the results of calling a function on every element?", ["forEach", "map", "filter", "some"], [2]),
  choice("JavaScript", "JavaScript", "Equality", "beginner", "What is the result of `0 == \"0\"`?", ["true", "false", "TypeError", "undefined"], [1]),
  choice("JavaScript", "JavaScript", "Functions", "intermediate", "Arrow functions differ from regular functions because they…", ["cannot take parameters", "do not have their own `this`", "are always async", "are hoisted with their body"], [2]),
  choice("JavaScript", "JavaScript", "Async", "intermediate", "Which statement about `Promise.all` is TRUE?", ["It resolves when the first promise resolves", "It rejects as soon as any promise rejects", "It ignores rejected promises", "It runs promises one after another"], [2]),
  choice("JavaScript", "JavaScript", "Scope", "intermediate", "What is a closure?", ["A function bundled with references to its surrounding scope", "A way to close a browser tab", "A sealed object", "A block that ends with `}`"], [1]),
  choice("JavaScript", "JavaScript", "Event loop", "advanced", "In the event loop, which runs FIRST after the current task: a resolved promise callback or a `setTimeout(fn, 0)` callback?", ["setTimeout callback", "The promise callback (microtask)", "They run in random order", "Neither — both wait for user input"], [2], { explanation: "Promise callbacks are microtasks and run before the next macrotask such as a timer." }),
  choice("JavaScript", "JavaScript", "Prototypes", "advanced", "`Object.create(null)` produces an object that…", ["inherits from Object.prototype", "has no prototype at all", "is frozen", "throws in strict mode"], [2]),
  choice("JavaScript", "JavaScript", "Memory", "advanced", "Which pattern is MOST likely to leak memory in a long-lived single-page app?", ["Using const", "Forgetting to remove event listeners on detached elements", "Using arrow functions", "Using template literals"], [2]),
  choice("JavaScript", "JavaScript", "Generators", "expert", "What does calling a generator function return?", ["The first yielded value", "An iterator object", "A Promise", "undefined"], [2]),
  { type: "multiple_select", cat: "JavaScript", subject: "JavaScript", topic: "Types", difficulty: "intermediate", prompt: "Which of these are JavaScript primitive types? (select all)", definition: { options: opts("string", "symbol", "array", "bigint", "object"), correct: ["o1", "o2", "o4"] } },
  { type: "true_false", cat: "JavaScript", subject: "JavaScript", topic: "Hoisting", difficulty: "beginner", prompt: "Variables declared with `let` are hoisted and can be read before their declaration without error.", definition: { correct: ["false"] }, explanation: "They are hoisted but sit in the temporal dead zone — reading them throws a ReferenceError." },
  { type: "fill_blank", cat: "JavaScript", subject: "JavaScript", topic: "JSON", difficulty: "beginner", prompt: "To turn an object into a JSON string use JSON.[[1]](obj), and to parse it back use JSON.[[2]](text).", definition: { blanks: [{ id: "1", accepted: ["stringify"] }, { id: "2", accepted: ["parse"] }], caseSensitive: false } },
  { type: "code_output", cat: "JavaScript", subject: "JavaScript", topic: "Closures", difficulty: "intermediate", prompt: "What does this code print?", definition: { language: "javascript", code: "for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}", schema: "", acceptedAnswers: ["3\n3\n3", "3 3 3"], testCases: [], rubric: "" }, explanation: "`var` is function-scoped, so every callback sees the final value 3." },
  { type: "coding", cat: "JavaScript", subject: "JavaScript", topic: "Algorithms", difficulty: "intermediate", prompt: "Write a function `debounce(fn, ms)` that delays calling `fn` until `ms` milliseconds have passed without another call.", definition: { language: "javascript", code: "function debounce(fn, ms) {\n  // your code\n}", schema: "", acceptedAnswers: [], testCases: [{ id: "t1", input: "3 calls within 50ms, ms=100", expectedOutput: "fn called once", hidden: false }, { id: "t2", input: "calls 200ms apart", expectedOutput: "fn called for each", hidden: true }], rubric: "Uses a timer that is cleared on each call (4), forwards arguments and `this` (3), returns a function (3)." }, marks: 10 },
  { type: "debugging", cat: "JavaScript", subject: "JavaScript", topic: "Async", difficulty: "advanced", prompt: "This function should return the total of all order amounts but always returns 0. Fix it.", definition: { language: "javascript", code: "async function total(ids) {\n  let sum = 0;\n  ids.forEach(async (id) => {\n    const o = await getOrder(id);\n    sum += o.amount;\n  });\n  return sum;\n}", schema: "", acceptedAnswers: [], testCases: [], rubric: "Replaces forEach with for…of / Promise.all so the awaits complete before returning." }, marks: 5 },
  { type: "ordering", cat: "JavaScript", subject: "JavaScript", topic: "Event loop", difficulty: "advanced", prompt: "Put these in the order they are logged: `console.log('A'); setTimeout(() => console.log('B')); Promise.resolve().then(() => console.log('C')); console.log('D');`", definition: { items: [{ id: "s1", text: "A" }, { id: "s2", text: "D" }, { id: "s3", text: "C" }, { id: "s4", text: "B" }] }, marks: 2 },
  // React
  choice("React", "React", "Hooks", "beginner", "Which hook stores local state in a function component?", ["useEffect", "useState", "useMemo", "useRef"], [2]),
  choice("React", "React", "Rendering", "intermediate", "Why should list items have a stable `key`?", ["For CSS styling", "So React can match items between renders", "It is required by JSX syntax", "To make items focusable"], [2]),
  choice("React", "React", "Hooks", "intermediate", "When does a `useEffect` with an empty dependency array run?", ["On every render", "Once after the first render (and cleanup on unmount)", "Never", "Before the first render"], [2]),
  choice("React", "React", "Performance", "advanced", "`React.memo` prevents a re-render when…", ["state inside the component changes", "props are shallowly equal to the previous props", "context changes", "the parent unmounts"], [2]),
  choice("React", "React", "State", "advanced", "Calling `setCount(count + 1)` twice in the same event handler increments count by…", ["2", "1", "0", "It throws"], [2], { explanation: "Both calls read the same `count` from the render closure; use the updater form to add twice." }),
  choice("React", "React", "Server Components", "expert", "Which of these can a React Server Component NOT do?", ["Read from a database", "Use useState", "Render other components", "Await a promise"], [2]),
  { type: "true_false", cat: "React", subject: "React", topic: "JSX", difficulty: "beginner", prompt: "JSX expressions must return a single root element (or a fragment).", definition: { correct: ["true"] } },
  { type: "match_following", cat: "React", subject: "React", topic: "Hooks", difficulty: "intermediate", prompt: "Match each hook to what it is for.", definition: { pairs: [{ id: "p1", left: "useState", right: "Local component state" }, { id: "p2", left: "useEffect", right: "Side effects after render" }, { id: "p3", left: "useRef", right: "Mutable value that doesn't re-render" }, { id: "p4", left: "useMemo", right: "Memoised computed value" }] }, marks: 2 },
  { type: "short_answer", cat: "React", subject: "React", topic: "Hooks", difficulty: "intermediate", prompt: "Name the hook that lets you read a Context value.", definition: { acceptedAnswers: ["useContext", "use"], caseSensitive: false, maxLength: 60, rubric: "" } },
  // SQL
  { type: "sql_query", cat: "SQL", subject: "SQL", topic: "Joins", difficulty: "intermediate", prompt: "Write a query that lists each department's name with its number of employees, including departments with no employees.", definition: { language: "sql", code: "", schema: "CREATE TABLE departments (id INT PRIMARY KEY, name TEXT);\nCREATE TABLE employees (id INT PRIMARY KEY, name TEXT, dept_id INT REFERENCES departments(id));", acceptedAnswers: [], testCases: [], rubric: "LEFT JOIN from departments (4), COUNT(e.id) not COUNT(*) (3), GROUP BY department (3)." }, marks: 10 },
  choice("SQL", "SQL", "Basics", "beginner", "Which clause filters rows AFTER aggregation?", ["WHERE", "HAVING", "ORDER BY", "LIMIT"], [2]),
  // Aptitude
  choice("Aptitude", "Aptitude", "Numbers", "beginner", "What is 15% of 240?", ["32", "36", "38", "40"], [2]),
  choice("Aptitude", "Aptitude", "Series", "beginner", "Next in the series: 2, 6, 12, 20, 30, ?", ["38", "40", "42", "44"], [3]),
  choice("Aptitude", "Aptitude", "Time & work", "intermediate", "A can finish a job in 6 days and B in 3 days. Working together, they finish in…", ["1.5 days", "2 days", "3 days", "4.5 days"], [2]),
  choice("Aptitude", "Aptitude", "Speed", "intermediate", "A train covers 180 km in 2.5 hours. Its average speed is…", ["62 km/h", "68 km/h", "72 km/h", "75 km/h"], [3]),
  choice("Aptitude", "Aptitude", "Logic", "intermediate", "All developers are engineers. Some engineers are managers. Which MUST be true?", ["All managers are developers", "Some developers are managers", "All developers are engineers", "No engineer is a developer"], [3]),
  choice("Aptitude", "Aptitude", "Probability", "advanced", "Two fair dice are rolled. Probability the sum is 7?", ["1/12", "1/6", "1/4", "7/36"], [2]),
  { type: "yes_no", cat: "Aptitude", subject: "Aptitude", topic: "Logic", difficulty: "beginner", prompt: "If today is Monday, will it be Monday again in 14 days?", definition: { correct: ["yes"] } },
  // Communication
  { type: "long_answer", cat: "Communication", subject: "Communication", topic: "Writing", difficulty: "intermediate", prompt: "A client is unhappy that a release slipped by a week. Write a short email (under 150 words) explaining the delay and the new plan.", definition: { acceptedAnswers: [], caseSensitive: false, maxLength: 1500, rubric: "Acknowledges impact (3), clear reason without blame (3), concrete new date + mitigation (3), professional tone (1)." }, marks: 10 },
  choice("Communication", "Communication", "Grammar", "beginner", "Choose the correct sentence.", ["Each of the team members have a laptop.", "Each of the team members has a laptop.", "Each of the team member have laptops.", "Each of team members has laptops."], [2]),
  // Mathematics (students)
  choice("Mathematics", "Mathematics", "Calculus", "intermediate", "The derivative of x³ is…", ["x²", "3x²", "3x", "x⁴/4"], [2]),
  choice("Mathematics", "Mathematics", "Calculus", "intermediate", "∫ 2x dx = ?", ["x² + C", "2x² + C", "x + C", "2 + C"], [1]),
  choice("Mathematics", "Mathematics", "Linear algebra", "advanced", "The determinant of [[2, 1], [4, 3]] is…", ["2", "10", "-2", "6"], [1]),
  choice("Mathematics", "Mathematics", "Probability", "beginner", "A fair coin is tossed twice. P(two heads) =", ["1/2", "1/3", "1/4", "3/4"], [3]),
  { type: "fill_blank", cat: "Mathematics", subject: "Mathematics", topic: "Trigonometry", difficulty: "beginner", prompt: "sin²θ + cos²θ = [[1]]", definition: { blanks: [{ id: "1", accepted: ["1", "one"] }], caseSensitive: false } },
  { type: "short_answer", cat: "Mathematics", subject: "Mathematics", topic: "Limits", difficulty: "advanced", prompt: "lim (x→0) sin(x)/x = ?", definition: { acceptedAnswers: ["1"], caseSensitive: false, maxLength: 20, rubric: "" } },
  // Compliance
  choice("Compliance", "Information Security", "Passwords", "beginner", "Which is the strongest password practice?", ["Reuse one strong password everywhere", "A unique passphrase per account + a password manager", "Change passwords every week", "Write passwords on a sticky note"], [2]),
  choice("Compliance", "Information Security", "Phishing", "beginner", "An email from 'IT' asks you to confirm your password via a link. You should…", ["Click and confirm quickly", "Reply with your password", "Report it as phishing and not click", "Forward it to colleagues"], [3]),
  { type: "true_false", cat: "Compliance", subject: "Information Security", topic: "Data", difficulty: "beginner", prompt: "It is fine to share client data over personal email if it is urgent.", definition: { correct: ["false"] } },
  choice("Compliance", "Information Security", "Devices", "beginner", "You leave your desk for a meeting. You should…", ["Leave the laptop unlocked", "Lock the screen (Win+L / Ctrl+Cmd+Q)", "Log out of every app", "Turn off the monitor"], [2]),
  { type: "image_based", cat: "Compliance", subject: "Information Security", topic: "Phishing", difficulty: "intermediate", prompt: "Look at the image. What is the safest first reaction to a padlock-less login page like this one?", media: { kind: "image", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Phishing_example.png/320px-Phishing_example.png", caption: "Example login page" }, definition: { options: opts("Log in quickly before it expires", "Check the address bar / report it before entering anything", "Enter a fake password to test it", "Share it on the team chat"), correct: ["o2"] } },
];

// True/False and Yes/No carry their fixed options, exactly as the app's registry stores them.
for (const q of QUESTIONS) {
  if (q.type === "true_false") q.definition.options = [{ id: "true", text: "True" }, { id: "false", text: "False" }];
  if (q.type === "yes_no") q.definition.options = [{ id: "yes", text: "Yes" }, { id: "no", text: "No" }];
}

export function autoGradable(q) {
  if (["long_answer", "coding", "sql_query", "debugging"].includes(q.type)) return false;
  if (q.type === "short_answer") return q.definition.acceptedAnswers.length > 0;
  return true;
}

export function publicView(q, rnd) {
  const d = q.definition;
  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
    case "multiple_select":
    case "image_based":
    case "audio_based":
    case "video_based":
      return { kind: "choice", multiple: q.type === "multiple_select" || q.type === "multiple_choice", options: rnd ? shuffle(d.options) : d.options };
    case "true_false":
      return { kind: "choice", multiple: false, options: [{ id: "true", text: "True" }, { id: "false", text: "False" }] };
    case "yes_no":
      return { kind: "choice", multiple: false, options: [{ id: "yes", text: "Yes" }, { id: "no", text: "No" }] };
    case "short_answer":
    case "long_answer":
      return { kind: "text", long: q.type === "long_answer", maxLength: d.maxLength ?? null };
    case "fill_blank":
      return { kind: "fill_blank", blankIds: d.blanks.map((b) => b.id) };
    case "match_following":
      return { kind: "match", left: d.pairs.map((p) => ({ id: p.id, text: p.left })), right: shuffle(d.pairs.map((p) => ({ id: p.id, text: p.right }))) };
    case "ordering": {
      let items = shuffle(d.items);
      if (items.every((x, i) => x.id === d.items[i].id)) items = [...items.slice(1), items[0]];
      return { kind: "ordering", items };
    }
    default:
      return { kind: "code", language: d.language, code: d.code, schema: d.schema ?? "", editable: q.type !== "code_output", answerMode: q.type === "code_output" ? "text" : "code", sampleTests: (d.testCases ?? []).filter((t) => !t.hidden).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })) };
  }
}

/** A plausible candidate response: right with probability `skill`, otherwise wrong / partial / skipped. */
export function respond(q, skill) {
  const d = q.definition;
  if (chance(0.06)) return null; // skipped
  const right = chance(skill);
  switch (q.type) {
    case "single_choice":
    case "image_based":
    case "true_false":
    case "yes_no": {
      const ids = q.type === "true_false" ? ["true", "false"] : q.type === "yes_no" ? ["yes", "no"] : d.options.map((o) => o.id);
      return { selected: [right ? d.correct[0] : ids.filter((i) => i !== d.correct[0])[rint(0, ids.length - 2)]] };
    }
    case "multiple_select":
      return { selected: right ? [...d.correct] : d.correct.slice(0, 1) };
    case "short_answer":
      return { text: right ? d.acceptedAnswers[0] : "useProvider" };
    case "fill_blank":
      return { blanks: Object.fromEntries(d.blanks.map((b, i) => [b.id, right || i === 0 ? b.accepted[0] : "?"])) };
    case "code_output":
      return { text: right ? d.acceptedAnswers[0] : "0\n1\n2" };
    case "match_following":
      return { pairs: Object.fromEntries(d.pairs.map((p, i) => [p.id, right || i < 2 ? p.id : d.pairs[(i + 1) % d.pairs.length].id])) };
    case "ordering":
      return { order: right ? d.items.map((x) => x.id) : [d.items[0].id, d.items[2].id, d.items[1].id, d.items[3].id] };
    case "long_answer":
      return { text: "Hi Priya,\n\nThanks for your patience. The release moved by a week because integration testing surfaced a data-migration issue we did not want to ship. We have fixed it and will deploy next Tuesday, with a daily status note until then.\n\nRegards" };
    default:
      return { code: right ? "function debounce(fn, ms) {\n  let t;\n  return function (...args) {\n    clearTimeout(t);\n    t = setTimeout(() => fn.apply(this, args), ms);\n  };\n}" : "// TODO" };
  }
}

export function grade(q, resp, marks, neg) {
  const base = { evaluatedBy: null, evaluatedAt: null, comment: "", overridden: false };
  if (!resp) return { ...base, status: "unanswered", awarded: 0, auto: true };
  if (!autoGradable(q)) return { ...base, status: "pending", awarded: null, auto: false };
  const d = q.definition;
  let f = 0;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
  switch (q.type) {
    case "multiple_select":
      f = resp.selected.length === d.correct.length && resp.selected.every((s) => d.correct.includes(s)) ? 1 : 0;
      break;
    case "short_answer":
      f = d.acceptedAnswers.some((a) => norm(a) === norm(resp.text)) ? 1 : 0;
      break;
    case "fill_blank":
      f = d.blanks.filter((b) => b.accepted.some((a) => norm(a) === norm(resp.blanks[b.id] ?? ""))).length / d.blanks.length;
      break;
    case "code_output":
      f = d.acceptedAnswers.some((a) => a.trim() === resp.text.trim()) ? 1 : 0;
      break;
    case "match_following":
      f = d.pairs.filter((p) => resp.pairs[p.id] === p.id).length / d.pairs.length;
      break;
    case "ordering":
      f = d.items.filter((x, i) => resp.order[i] === x.id).length / d.items.length;
      break;
    default:
      f = resp.selected[0] === d.correct[0] ? 1 : 0;
  }
  const status = f >= 0.9999 ? "correct" : f <= 0 ? "incorrect" : "partial";
  return { ...base, status, awarded: status === "incorrect" ? -neg : r2(marks * f), auto: true, evaluatedAt: new Date() };
}

export function computeResult(paper, sections, config, startedAt, submittedAt) {
  const secs = sections.map((s, i) => ({ index: i, title: s.title, total: 0, obtained: 0, percentage: 0, questions: 0, correct: 0, incorrect: 0, partial: 0, unanswered: 0, pending: 0 }));
  let total = 0;
  let pos = 0;
  let neg = 0;
  const c = { correct: 0, incorrect: 0, partial: 0, unanswered: 0, pending: 0 };
  for (const it of paper) {
    const s = secs[it.section];
    total += it.marks;
    s.total += it.marks;
    s.questions += 1;
    c[it.outcome.status] += 1;
    s[it.outcome.status] += 1;
    const aw = it.outcome.awarded ?? 0;
    if (aw >= 0) pos += aw;
    else neg += aw;
    s.obtained += aw;
  }
  const finalScore = r2(Math.max(0, pos + neg));
  const percentage = total ? r2((finalScore / total) * 100) : 0;
  const passed = c.pending === 0 && (config.passMode === "marks" ? finalScore >= config.passingMarks : percentage >= config.passingPercentage);
  return {
    totalQuestions: paper.length,
    attempted: paper.length - c.unanswered,
    ...c,
    totalMarks: r2(total),
    marksObtained: r2(pos),
    negativeMarks: r2(neg),
    finalScore,
    percentage,
    passed,
    provisional: c.pending > 0,
    timeTakenSec: Math.round((submittedAt - startedAt) / 1000),
    sections: secs.filter((s) => s.questions).map((s) => ({ ...s, total: r2(s.total), obtained: r2(Math.max(0, s.obtained)), percentage: s.total ? r2((Math.max(0, s.obtained) / s.total) * 100) : 0 })),
  };
}

export const CONFIG = (over = {}) => ({
  durationMinutes: 30,
  autoSubmit: true,
  startAt: null,
  endAt: null,
  maxAttempts: 1,
  allowRetake: false,
  retakeOnlyIfFailed: false,
  questionsPerAttempt: null,
  randomizeQuestions: false,
  randomizeOptions: true,
  negativeMarking: false,
  passMode: "percentage",
  passingPercentage: 50,
  passingMarks: 0,
  allowNavigation: true,
  allowBack: true,
  allowReview: true,
  resultRelease: "immediate",
  resultDetail: "correct",
  showExplanations: true,
  attemptScoring: "highest",
  security: { requireFullscreen: false, detectTabSwitch: true, blockCopyPaste: true, blockRightClick: true, singleSession: true, maxViolations: null },
  ...over,
});
export const section = (id, title, questionIds, over = {}) => ({ id, title, description: "", timeLimitMinutes: null, negativeMarking: null, marksPerQuestion: null, questionIds, rules: [], ...over });

export async function seedOts(db) {
  const passwordHash = hashPassword(PASSWORD);
  const now = new Date();

  // ── wipe previous demo run ──
  for (const c of ["ots_questions", "ots_tests", "ots_dispatches", "ots_assignments", "ots_attempts", "ots_certificates", "ots_categories", "ots_activity_logs"]) await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });
  await db.collection("external_notifications").deleteMany({ _id: new RegExp(`^${D}`) });

  // ── HRMS org: reuse, or create a minimal one ──
  let depts = await db.collection("hrms_departments").find({ deletedAt: null }).toArray();
  if (!depts.some((d) => /engineering/i.test(d.name))) {
    const eng = { _id: `${D}hd-engineering`, name: "Engineering", code: "ENG", description: null, headEmployeeId: null, ...audit() };
    await db.collection("hrms_departments").updateOne({ _id: eng._id }, { $set: eng }, { upsert: true });
    depts.push(eng);
  }
  if (!depts.some((d) => /sales/i.test(d.name))) {
    const sales = { _id: `${D}hd-sales`, name: "Sales", code: "SAL", description: null, headEmployeeId: null, ...audit() };
    await db.collection("hrms_departments").updateOne({ _id: sales._id }, { $set: sales }, { upsert: true });
    depts.push(sales);
  }
  const dept = (name) => depts.find((d) => d.name.toLowerCase().includes(name.toLowerCase()));
  const engDept = dept("engineering");
  let seniorDev = await db.collection("hrms_designations").findOne({ deletedAt: null, departmentId: engDept._id });
  if (!seniorDev) {
    seniorDev = { _id: `${D}ds-senior-developer`, title: "Senior Developer", departmentId: engDept._id, level: null, ...audit() };
    await db.collection("hrms_designations").updateOne({ _id: seniorDev._id }, { $set: seniorDev }, { upsert: true });
  }

  // ── staff logins + their HRMS employees ──
  const users = {};
  for (const [i, a] of OTS_DEMO_ACCOUNTS.entries()) {
    const local = a.email.split("@")[0].replace("demo.ots.", "");
    let userId = (await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } }))?._id ?? new ObjectId();
    let empId = null;
    if (a.dept) {
      empId = `${D}emp-${local}`;
      const d = dept(a.dept);
      await db.collection("hrms_employees").deleteMany({ $or: [{ _id: empId }, { email: a.email }, { workEmail: a.email }] });
      await db.collection("hrms_employees").insertOne({
        _id: empId, employeeCode: `DOTS-${String(i + 1).padStart(3, "0")}`, firstName: local[0].toUpperCase() + local.slice(1), lastName: "Demo", workEmail: a.email, email: a.email, status: "active",
        personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null },
        professional: { departmentId: d._id, designationId: a.dept === "Engineering" ? seniorDev._id : null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: null, joiningDate: "2025-04-01", probationEndDate: null, relievingDate: null },
        emergencyContacts: [], recruitment: null, adminUserId: userId.toString(), ...audit(),
      });
    }
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { email: a.email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: empId, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: userId, createdAt: now } },
      { upsert: true }
    );
    users[local] = { id: userId.toString(), empId, email: a.email, name: `${local[0].toUpperCase()}${local.slice(1)} Demo` };
  }
  const actor = users.manager;

  // Other real employees in Engineering become extra candidates (read from HRMS, not invented).
  const engEmployees = await db.collection("hrms_employees").find({ deletedAt: null, "professional.departmentId": engDept._id, status: { $in: ["active", "probation", "notice_period", "on_leave"] } }, { projection: { firstName: 1, lastName: 1 } }).limit(12).toArray();

  // ── Careers applicant + portal login ──
  const appId = new ObjectId("6a0000000000000000000a01");
  await db.collection("career_applications").updateOne(
    { _id: appId },
    { $set: { positionId: null, positionSlug: "mern-developer", positionTitle: "MERN Developer", name: "Aisha Applicant", email: OTS_PORTAL_ACCOUNTS[0].email, phone: "+91 9000000101", coverNote: "Keen to join the engineering team.", resume: { storageKey: "demo-ots-resume.pdf", filename: "aisha-resume.pdf", contentType: "application/pdf", size: 120000 }, status: "shortlisted", source: "careers-page", createdAt: at(20), updatedAt: at(2), _demo: true } },
    { upsert: true }
  );
  const otherApps = await db.collection("career_applications").find({ _id: { $ne: appId }, status: { $in: ["shortlisted", "under_review", "interview_scheduled"] } }, { projection: { name: 1 } }).limit(6).toArray();

  // ── TMS program / batch / student + portal login ──
  let batch = await db.collection("training_batches").findOne({ deletedAt: null, status: { $in: ["ongoing", "upcoming", "active"] } });
  let program = batch ? await db.collection("training_programs").findOne({ _id: batch.programId }) : null;
  if (!batch || !program) {
    program = { _id: `${D}prg`, programCode: "PRG-OTS", name: "BSc Data Science (Semester 5)", category: "industrial", technology: "Mathematics", durationWeeks: 16, mode: "online", fees: null, currency: "INR", description: null, learningOutcomes: [], tools: [], liveProjectCount: 0, certificateIncluded: true, placementAssistance: false, status: "active", ...audit() };
    batch = { _id: `${D}bat`, batchCode: "BAT-OTS", programId: program._id, name: "BSc Batch 2026", startDate: "2026-07-01", endDate: "2026-12-15", timing: null, mentorId: null, capacity: 40, mode: "online", status: "ongoing", notes: null, ...audit() };
    await db.collection("training_programs").updateOne({ _id: program._id }, { $set: program }, { upsert: true });
    await db.collection("training_batches").updateOne({ _id: batch._id }, { $set: batch }, { upsert: true });
  }
  const studentId = `${D}stu`;
  await db.collection("training_students").updateOne(
    { _id: studentId },
    { $set: { studentCode: "STU-OTS-1", fullName: "Sam Student", email: OTS_PORTAL_ACCOUNTS[1].email, mobile: "+91 9000000102", address: null, education: {}, guardian: {}, links: {}, status: "active", applicationId: null, notes: null, ...audit() } },
    { upsert: true }
  );
  await db.collection("student_enrollments").updateOne({ _id: `${D}enr` }, { $set: { studentId, programId: program._id, batchId: batch._id, status: "active", progressPercent: 55, enrolledOn: "2026-07-01", ...audit() } }, { upsert: true });
  const batchStudents = await db.collection("student_enrollments").find({ batchId: batch._id, deletedAt: null, status: "active" }, { projection: { studentId: 1 } }).limit(10).toArray();

  for (const [i, p] of OTS_PORTAL_ACCOUNTS.entries()) {
    const _id = `${D}portal-${i + 1}`;
    await db.collection("external_users").deleteOne({ email: p.email, _id: { $ne: _id } });
    await db.collection("external_users").updateOne(
      { _id },
      { $set: { email: p.email, phone: `+91 900000010${i + 1}`, passwordHash, role: p.role, applicationId: p.role === "job_applicant" ? appId.toString() : null, studentId: p.role === "trainee" ? studentId : null, clientId: null, displayName: p.role === "job_applicant" ? "Aisha Applicant" : "Sam Student", status: "active", failedLoginAttempts: 0, lockedUntil: null, mustChangePassword: false, createdAt: at(30), updatedAt: at(1), lastLoginAt: null, leadId: null, activeLeadId: null, referralCode: null, referredByCode: null } },
      { upsert: true }
    );
  }

  // ── categories ──
  const tcat = {};
  const qcat = {};
  const cats = [];
  for (const name of ["Technical", "Aptitude", "HR & Compliance", "Course Exams", "Certification"]) {
    tcat[name] = `${D}tc-${name.toLowerCase().replace(/\W+/g, "-")}`;
    cats.push({ _id: tcat[name], kind: "test", name, description: "", ...stamp(at(60), actor.id) });
  }
  for (const name of ["JavaScript", "React", "SQL", "Aptitude", "Communication", "Mathematics", "Compliance"]) {
    qcat[name] = `${D}qc-${name.toLowerCase()}`;
    cats.push({ _id: qcat[name], kind: "question", name, description: "", ...stamp(at(60), actor.id) });
  }
  for (const c of cats) {
    // A real category with the same name wins — never create a duplicate.
    const existing = await db.collection("ots_categories").findOne({ kind: c.kind, name: c.name, deletedAt: null, _id: { $not: new RegExp(`^${D}`) } });
    if (existing) {
      if (c.kind === "test") tcat[c.name] = existing._id;
      else qcat[c.name] = existing._id;
    } else await db.collection("ots_categories").insertOne(c);
  }

  // ── questions ──
  const qdocs = QUESTIONS.map((q, i) => ({
    _id: `${D}q-${String(i + 1).padStart(3, "0")}`,
    code: `Q-D${String(i + 1).padStart(4, "0")}`,
    type: q.type,
    prompt: q.prompt,
    media: q.media ?? null,
    categoryId: qcat[q.cat] ?? null,
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    marks: q.marks ?? (q.difficulty === "advanced" || q.difficulty === "expert" ? 2 : 1),
    negativeMarks: q.type === "single_choice" && q.cat === "Aptitude" ? 0.25 : 0,
    explanation: q.explanation ?? "",
    tags: [q.subject.toLowerCase().replace(/\s+/g, "-"), q.difficulty],
    status: "active",
    definition: q.definition,
    version: 1,
    ...stamp(at(55 - (i % 20)), users.author.id),
  }));
  await db.collection("ots_questions").insertMany(qdocs);
  const byCat = (cat, diff) => qdocs.filter((q) => q.categoryId === qcat[cat] && (!diff || q.difficulty === diff)).map((q) => q._id);
  const qById = new Map(qdocs.map((q, i) => [q._id, { ...q, _src: QUESTIONS[i] }]));

  // ── tests ──
  const jsFund = byCat("JavaScript").filter((id) => ["beginner", "intermediate"].includes(qById.get(id).difficulty) && autoGradable(qById.get(id)._src)).slice(0, 8);
  const tests = [
    {
      key: "js", name: "JavaScript Technical Assessment", testType: "assessment", cat: "Technical", subject: "JavaScript", difficulty: "mixed", status: "published", departmentIds: [engDept._id], designationIds: [seniorDev._id],
      description: "Core JavaScript for the engineering team: fundamentals, the event loop and a short coding task.",
      instructions: "Answer every question. Section 3 is marked by an evaluator. You can move freely between questions and mark them for review.",
      config: CONFIG({ durationMinutes: 40, negativeMarking: true, passingPercentage: 60 }),
      sections: [
        section(`${D}sec-js-1`, "JavaScript Fundamentals", jsFund),
        section(`${D}sec-js-2`, "Advanced JavaScript", [], { rules: [{ id: "r1", count: 3, difficulty: "advanced", categoryId: qcat.JavaScript, type: "", subject: "", topic: "", tag: "" }] }),
        section(`${D}sec-js-3`, "Coding", [qdocs.find((q) => q.type === "coding")._id, qdocs.find((q) => q.type === "debugging")._id]),
      ],
      created: 40,
    },
    {
      key: "react", name: "React Developer Certification", testType: "certification", cat: "Certification", subject: "React", difficulty: "intermediate", status: "published", departmentIds: [engDept._id], designationIds: [],
      description: "Certification for engineers working on React front-ends.", instructions: "Pass mark 60%. Two attempts; your highest score counts.",
      config: CONFIG({ durationMinutes: 20, allowRetake: true, maxAttempts: 2, attemptScoring: "highest", passingPercentage: 60, randomizeQuestions: true }),
      sections: [section(`${D}sec-react-1`, "React", byCat("React"))],
      certificate: { enabled: true, title: "Certified React Developer", validityMonths: 24 },
      created: 35,
    },
    {
      key: "apt", name: "Aptitude Screening Test", testType: "screening", cat: "Aptitude", subject: "Aptitude", difficulty: "mixed", status: "published",
      description: "Pre-screening for applicants: numerical, logical and verbal reasoning.", instructions: "25 minutes. Wrong answers lose ¼ mark. The hiring team reviews results before sharing them.",
      config: CONFIG({ durationMinutes: 25, negativeMarking: true, resultRelease: "manual", resultDetail: "score", showExplanations: false, allowBack: true, security: { requireFullscreen: true, detectTabSwitch: true, blockCopyPaste: true, blockRightClick: true, singleSession: true, maxViolations: 5 } }),
      sections: [section(`${D}sec-apt-1`, "Quantitative & Logical", byCat("Aptitude")), section(`${D}sec-apt-2`, "Verbal", byCat("Communication"))],
      created: 30,
    },
    {
      key: "math", name: "Semester 5 Mathematics — Chapter Test", testType: "examination", cat: "Course Exams", subject: "Mathematics", difficulty: "intermediate", status: "published",
      description: "Chapter test for the current batch: calculus, algebra and probability.", instructions: "Two timed sections. Once a section's time is up it locks and the next begins.",
      config: CONFIG({ durationMinutes: 30, passingPercentage: 40, resultDetail: "correct" }),
      sections: [
        section(`${D}sec-math-1`, "Calculus & Algebra", byCat("Mathematics").filter((id) => ["Calculus", "Linear algebra", "Limits"].includes(qById.get(id).topic)), { timeLimitMinutes: 15 }),
        section(`${D}sec-math-2`, "Probability & Trigonometry", byCat("Mathematics").filter((id) => ["Probability", "Trigonometry"].includes(qById.get(id).topic)), { timeLimitMinutes: 10 }),
      ],
      created: 25,
    },
    {
      key: "sec", name: "Information Security Compliance Quiz", testType: "training", cat: "HR & Compliance", subject: "Information Security", difficulty: "beginner", status: "published",
      description: "Annual compliance quiz for every employee.", instructions: "10 minutes, untimed sections. You need 80% to pass; you can retake it up to three times.",
      config: CONFIG({ durationMinutes: 10, passingPercentage: 80, allowRetake: true, maxAttempts: 3, retakeOnlyIfFailed: true, attemptScoring: "latest" }),
      sections: [section(`${D}sec-sec-1`, "Security basics", byCat("Compliance"))],
      created: 50,
    },
    {
      key: "closed", name: "Q2 SQL Skills Check", testType: "assessment", cat: "Technical", subject: "SQL", difficulty: "intermediate", status: "closed",
      description: "Last quarter's SQL check (closed).", instructions: "",
      config: CONFIG({ durationMinutes: 20, endAt: at(10) }),
      sections: [section(`${D}sec-sql-1`, "SQL", byCat("SQL"))],
      created: 80,
    },
    {
      key: "draft", name: "Node.js Backend Assessment", testType: "assessment", cat: "Technical", subject: "Node.js", difficulty: "advanced", status: "draft",
      description: "Being written — needs Node.js questions before it can be published.", instructions: "",
      config: CONFIG({ durationMinutes: 45 }),
      sections: [section(`${D}sec-node-1`, "Node.js", [], { rules: [{ id: "r1", count: 10, difficulty: "", categoryId: "", type: "", subject: "Node.js", topic: "", tag: "" }] })],
      created: 3,
    },
    {
      key: "arch", name: "2025 Onboarding Quiz", testType: "practice", cat: "HR & Compliance", subject: "Onboarding", difficulty: "beginner", status: "archived",
      description: "Retired onboarding quiz.", instructions: "",
      config: CONFIG({ durationMinutes: 10 }),
      sections: [section(`${D}sec-arch-1`, "Onboarding", byCat("Compliance").slice(0, 3))],
      created: 200,
    },
  ];
  const T = {};
  const testDocs = tests.map((t, i) => {
    const manual = t.sections.flatMap((s) => s.questionIds);
    const marks = manual.reduce((a, id) => a + qById.get(id).marks, 0) + t.sections.reduce((a, s) => a + s.rules.reduce((b, r) => b + r.count * 2, 0), 0);
    const count = manual.length + t.sections.reduce((a, s) => a + s.rules.reduce((b, r) => b + r.count, 0), 0);
    const doc = {
      _id: `${D}t-${t.key}`,
      code: `TST-D${String(i + 1).padStart(3, "0")}`,
      name: t.name,
      description: t.description,
      categoryId: tcat[t.cat] ?? null,
      testType: t.testType,
      subject: t.subject,
      departmentIds: t.departmentIds ?? [],
      designationIds: t.designationIds ?? [],
      difficulty: t.difficulty,
      instructions: t.instructions,
      tags: [t.subject.toLowerCase()],
      language: "English",
      status: t.status,
      config: t.config,
      sections: t.sections,
      certificate: t.certificate ?? { enabled: false, title: "", validityMonths: null },
      publishedAt: t.status === "draft" ? null : at(t.created - 1),
      publishedBy: t.status === "draft" ? null : actor.id,
      closedAt: t.status === "closed" ? at(10) : null,
      archivedAt: t.status === "archived" ? at(100) : null,
      paperStats: { questionCount: count, servedCount: count, totalMarks: marks, marksVary: t.sections.some((s) => s.rules.length > 0 && !s.marksPerQuestion) },
      ...stamp(at(t.created), users.author.id),
    };
    T[t.key] = doc;
    return doc;
  });
  await db.collection("ots_tests").insertMany(testDocs);

  // ── assignments + attempts ──
  const dispatches = [];
  const assignments = [];
  const attempts = [];
  const certs = [];
  const logs = [];
  const notices = [];
  let certSeq = 0;
  let logSeq = 0;
  const log = (d, action, entity, entityId, entityLabel, testId, summary, by = actor) => logs.push({ _id: `${D}log-${++logSeq}`, actorId: by?.id ?? "system", actorEmail: by?.email ?? null, action, entity, entityId, entityLabel, testId, summary, metadata: null, createdAt: d });
  for (const t of testDocs) {
    log(t.createdAt, "create", "test", t._id, t.name, t._id, `${t.code} · ${t.testType}`, users.author);
    if (t.publishedAt) log(t.publishedAt, "publish", "test", t._id, t.name, t._id, t.code);
    if (t.status === "archived") log(t.archivedAt, "archive", "test", t._id, t.name, t._id, "Archived");
  }

  function dispatch(testKey, targets, summary, daysAgo, people, opts = {}) {
    const test = T[testKey];
    const d = { _id: `${D}dsp-${dispatches.length + 1}`, testId: test._id, targets, targetSummary: summary, applicantStatuses: [], startAt: null, dueAt: opts.dueAt ?? null, maxAttempts: null, priority: opts.priority ?? "normal", instructions: opts.instructions ?? "", notify: true, resultRelease: null, resultDetail: null, certificateEligible: true, allowLateStart: false, created: people.length, skipped: 0, ...stamp(at(daysAgo), actor.id) };
    dispatches.push(d);
    log(d.createdAt, "assign", "assignment", d._id, test.name, test._id, `${people.length} assigned → ${summary}`);
    return people.map((p) => {
      const a = {
        _id: `${D}asg-${assignments.length + 1}`, dispatchId: d._id, testId: test._id, candidate: p.ref, candidateKey: `${p.ref.kind}:${p.ref.id}`, candidateLabel: p.label,
        startAt: null, dueAt: d.dueAt, maxAttempts: null, extraAttempts: 0, priority: d.priority, instructions: d.instructions, allowLateStart: false, resultRelease: null, resultDetail: null, certificateEligible: true,
        status: "assigned", attemptsUsed: 0, activeAttemptId: null, result: null, resultPublishedAt: null, startedAt: null, completedAt: null, cancelledAt: null, cancelReason: null, remindedDueAt: null, expiredNotifiedAt: null,
        ...stamp(at(daysAgo), actor.id),
      };
      assignments.push(a);
      notices.push({ ref: p.ref, a, title: `New test assigned: ${test.name}`, when: at(daysAgo) });
      return a;
    });
  }

  function attempt(a, daysAgo, skill, opts = {}) {
    const test = T[a.testId.replace(`${D}t-`, "")] ?? testDocs.find((t) => t._id === a.testId);
    const startedAt = at(daysAgo, rint(9, 17), rint(0, 59));
    const minutes = opts.minutes ?? Math.max(3, Math.round((test.config.durationMinutes ?? 20) * (0.45 + rng() * 0.5)));
    const submittedAt = new Date(startedAt.getTime() + minutes * 60000 + rint(0, 50) * 1000);
    const paper = [];
    test.sections.forEach((sec, si) => {
      let ids = [...sec.questionIds];
      for (const r of sec.rules) ids.push(...shuffle(qdocs.filter((q) => q.status === "active" && (!r.difficulty || q.difficulty === r.difficulty) && (!r.categoryId || q.categoryId === r.categoryId) && !ids.includes(q._id)).map((q) => q._id)).slice(0, r.count));
      if (test.config.randomizeQuestions) ids = shuffle(ids);
      for (const id of ids) {
        const q = qById.get(id);
        const neg = (sec.negativeMarking ?? test.config.negativeMarking) ? q.negativeMarks : 0;
        paper.push({ qid: q._id, code: q.code, section: si, type: q.type, prompt: q.prompt, media: q.media, difficulty: q.difficulty, subject: q.subject, topic: q.topic, categoryId: q.categoryId, explanation: q.explanation, definition: q.definition, view: publicView(q._src, test.config.randomizeOptions), marks: q.marks, negativeMarks: neg, autoGradable: autoGradable(q._src), outcome: null });
      }
    });
    const answers = paper.map((it) => {
      const src = qById.get(it.qid)._src;
      const resp = opts.blank ? null : respond(src, skill);
      return { response: resp, flagged: chance(0.08), visited: true, timeMs: rint(15, 140) * 1000, savedAt: submittedAt };
    });
    paper.forEach((it, i) => {
      it.outcome = grade(qById.get(it.qid)._src, answers[i].response, it.marks, it.negativeMarks);
      if (it.outcome.status === "pending" && opts.evaluate) {
        const m = r2(it.marks * (0.4 + rng() * 0.6));
        it.outcome = { status: m >= it.marks ? "correct" : "partial", awarded: m, auto: false, evaluatedBy: users.evaluator.id, evaluatedAt: new Date(submittedAt.getTime() + DAY), comment: "Good structure; see rubric for the missing points.", overridden: false };
      }
    });
    const sections = test.sections.map((s) => ({ title: s.title, timeLimitSec: s.timeLimitMinutes ? s.timeLimitMinutes * 60 : null, startedAt, deadlineAt: null, locked: true }));
    const result = computeResult(paper, test.sections, test.config, startedAt, submittedAt);
    const status = result.pending > 0 ? "pending_evaluation" : "evaluated";
    const release = test.config.resultRelease;
    const published = release === "immediate" || (release === "after_evaluation" && status === "evaluated") || opts.publish;
    const reason = opts.reason ?? "MANUAL";
    const events = opts.events ?? (chance(0.25) ? [{ type: "tab_hidden", at: new Date(startedAt.getTime() + 300000), detail: "Tab hidden / minimised" }] : []);
    const att = {
      _id: `${D}att-${attempts.length + 1}`, assignmentId: a._id, testId: test._id, candidate: a.candidate, candidateKey: a.candidateKey, attemptNo: a.attemptsUsed + 1, status,
      startedAt, deadlineAt: test.config.durationMinutes ? new Date(startedAt.getTime() + test.config.durationMinutes * 60000) : null, softDeadlineAt: null, submittedAt, submitReason: reason,
      sessionId: "demo", seed: rint(1, 1e9), config: test.config, testName: test.name, sectionMode: test.sections.some((s) => s.timeLimitMinutes) ? "sequential" : "free", sections, currentSection: sections.length - 1, cursor: paper.length - 1,
      paper, answers, events, violations: events.filter((e) => ["tab_hidden", "fullscreen_exit", "multiple_session"].includes(e.type)).length,
      client: { startIp: `10.0.${rint(0, 20)}.${rint(2, 250)}`, startUserAgent: "Mozilla/5.0 (demo)", lastIp: null, channel: a.candidate.kind === "applicant" || (a.candidate.kind === "student") ? "portal" : "staff" },
      result, evaluatedAt: status === "evaluated" ? submittedAt : null, resultPublishedAt: published ? new Date(submittedAt.getTime() + 60000) : null, takenBy: "demo", createdAt: startedAt, updatedAt: submittedAt,
    };
    attempts.push(att);
    a.attemptsUsed += 1;
    a.startedAt = a.startedAt ?? startedAt;
    log(startedAt, "start", "attempt", att._id, `${a.candidateLabel} · ${test.name}`, test._id, `Attempt ${att.attemptNo} started`, null);
    log(submittedAt, reason === "MANUAL" ? "submit" : "auto_submit", "attempt", att._id, `${test.name} · attempt ${att.attemptNo}`, test._id, reason, null);
    for (const e of events) log(e.at, "security_event", "attempt", att._id, `${test.name} · attempt ${att.attemptNo}`, test._id, e.detail, null);
    if (status === "evaluated") log(submittedAt, "result_generated", "result", att._id, `${a.candidateLabel} · ${test.name}`, test._id, `Attempt ${att.attemptNo}: ${result.finalScore}/${result.totalMarks} (${result.percentage}%) — ${result.passed ? "passed" : "not passed"}`, null);

    // aggregate per policy
    const mine = attempts.filter((x) => x.assignmentId === a._id && x.status === "evaluated");
    if (mine.length) {
      const pol = test.config.attemptScoring;
      const pick = pol === "latest" ? mine[mine.length - 1] : [...mine].sort((x, y) => y.result.percentage - x.result.percentage)[0];
      a.result = { attemptId: pick._id, score: pick.result.finalScore, total: pick.result.totalMarks, percentage: pick.result.percentage, passed: pick.result.passed, policy: pol, attemptsCounted: mine.length };
    }
    const anyPending = attempts.some((x) => x.assignmentId === a._id && x.status === "pending_evaluation");
    const released = attempts.some((x) => x.assignmentId === a._id && x.status === "evaluated" && x.resultPublishedAt);
    a.status = anyPending ? "submitted" : released ? "completed" : "evaluated";
    if (released) {
      a.resultPublishedAt = a.resultPublishedAt ?? att.resultPublishedAt;
      a.completedAt = a.completedAt ?? att.resultPublishedAt;
    }
    if (test.certificate.enabled && a.result?.passed && released && !certs.some((c) => c.assignmentId === a._id)) {
      certSeq += 1;
      const issuedOn = new Date(submittedAt.getTime() + 120000);
      const validUntil = new Date(issuedOn);
      validUntil.setMonth(validUntil.getMonth() + (test.certificate.validityMonths ?? 24));
      certs.push({ _id: `${D}cert-${certSeq}`, certificateNumber: `OTS-${issuedOn.getFullYear()}-D${String(certSeq).padStart(3, "0")}`, verificationCode: `demoOts${certSeq}Verify`, assignmentId: a._id, attemptId: a.result.attemptId, testId: test._id, candidate: a.candidate, candidateKey: a.candidateKey, candidateName: a.candidateLabel, testName: test.name, title: test.certificate.title, score: a.result.score, totalMarks: a.result.total, percentage: a.result.percentage, organization: "Demo Company", issuedOn, validUntil, revoked: false, revokedAt: null, revokedReason: null, issuedBy: null, ...stamp(issuedOn, "system") });
      log(issuedOn, "certificate_generated", "certificate", `${D}cert-${certSeq}`, `OTS-D${certSeq} · ${a.candidateLabel}`, test._id, `${test.name}: ${a.result.percentage}%`, null);
    }
    return att;
  }

  const emp = (u) => ({ ref: { kind: "employee", id: u.empId }, label: u.name });
  const engPeople = [emp(users.employee), emp(users.manager), emp(users.author), emp(users.evaluator), ...engEmployees.filter((e) => !String(e._id).startsWith(D)).map((e) => ({ ref: { kind: "employee", id: e._id }, label: `${e.firstName} ${e.lastName}`.trim() }))];

  // JavaScript assessment → Engineering department + Senior Developer role (one dispatch).
  const jsA = dispatch("js", [{ type: "department", ids: [engDept._id] }, { type: "designation", ids: [seniorDev._id] }], `Department: ${engDept.name} · Role / Designation: ${seniorDev.title}`, 21, engPeople, { dueAt: new Date(NOW + 5 * DAY), priority: "high" });
  jsA.forEach((a, i) => {
    if (a.candidateKey === `employee:${users.employee.empId}`) return; // left pending for the live demo
    if (i % 5 === 4) return; // a few still pending
    attempt(a, rint(3, 18), 0.45 + rng() * 0.5, { evaluate: i % 3 !== 1 });
  });

  // React certification → individual employees (the demo employee has passed it once).
  const reactA = dispatch("react", [{ type: "employee", ids: engPeople.slice(0, 5).map((p) => p.ref.id) }], "Individual Employees", 18, engPeople.slice(0, 5));
  reactA.forEach((a, i) => {
    if (i === 0) {
      attempt(a, 12, 0.35);
      attempt(a, 6, 0.95);
    } else if (i < 4) attempt(a, rint(2, 14), 0.5 + rng() * 0.45);
  });

  // Compliance quiz → every full-time employee (from HRMS).
  const allEmp = await db.collection("hrms_employees").find({ deletedAt: null, status: { $in: ["active", "probation"] }, "professional.employmentType": "full_time" }, { projection: { firstName: 1, lastName: 1 } }).limit(25).toArray();
  const secPeople = allEmp.map((e) => ({ ref: { kind: "employee", id: e._id }, label: `${e.firstName} ${e.lastName}`.trim() }));
  const secA = dispatch("sec", [{ type: "employment_type", ids: ["full_time"] }], "Employee Type: Full-time", 45, secPeople, { dueAt: new Date(NOW + 10 * DAY) });
  secA.forEach((a, i) => {
    if (a.candidateKey === `employee:${users.sales.empId}` || i % 4 === 3) return;
    const first = attempt(a, rint(20, 40), 0.7 + rng() * 0.3);
    if (!first.result.passed && chance(0.7)) attempt(a, rint(5, 18), 0.95);
  });

  // Aptitude screening → the demo applicant (pending) + real shortlisted applicants (taken; results held for the hiring team).
  const aptPeople = [{ ref: { kind: "applicant", id: appId.toString() }, label: "Aisha Applicant" }, ...otherApps.map((x) => ({ ref: { kind: "applicant", id: x._id.toString() }, label: x.name }))];
  const aptA = dispatch("apt", [{ type: "applicant", ids: aptPeople.map((p) => p.ref.id) }], "Individual Applicants", 9, aptPeople, { dueAt: new Date(NOW + 3 * DAY), priority: "urgent", instructions: "Please complete before your technical interview." });
  aptA.forEach((a, i) => {
    if (i === 0) return;
    const opts = i === 1 ? { reason: "TIMEOUT_AUTO_SUBMISSION", minutes: 25 } : i === 2 ? { reason: "SECURITY_AUTO_SUBMISSION", events: [1, 2, 3, 4, 5].map((k) => ({ type: k % 2 ? "tab_hidden" : "fullscreen_exit", at: at(4, 11, k * 3), detail: k % 2 ? "Tab hidden / minimised" : "Left full screen" })) } : {};
    attempt(a, rint(2, 7), 0.4 + rng() * 0.5, { evaluate: true, publish: i === 3, ...opts });
  });

  // Semester 5 maths → the TMS batch.
  const mathPeople = Array.from(new Set([studentId, ...batchStudents.map((s) => s.studentId)])).map((id) => ({ ref: { kind: "student", id }, label: id === studentId ? "Sam Student" : "Student" }));
  const stuNames = await db.collection("training_students").find({ _id: { $in: mathPeople.map((p) => p.ref.id) } }, { projection: { fullName: 1 } }).toArray();
  for (const p of mathPeople) p.label = stuNames.find((s) => s._id === p.ref.id)?.fullName ?? p.label;
  const mathA = dispatch("math", [{ type: "batch", ids: [batch._id] }], `Batch: ${batch.name}`, 7, mathPeople, { dueAt: new Date(NOW + 4 * DAY) });
  mathA.forEach((a, i) => {
    if (i === 0) return;
    attempt(a, rint(1, 5), 0.4 + rng() * 0.55);
  });

  // Closed SQL check → some expired, some done.
  const sqlA = dispatch("closed", [{ type: "department", ids: [engDept._id] }], `Department: ${engDept.name}`, 70, engPeople.slice(0, 6), { dueAt: at(12) });
  sqlA.forEach((a, i) => {
    if (i % 3 === 0) {
      a.status = "expired";
      a.expiredNotifiedAt = at(10);
    } else attempt(a, rint(15, 60), 0.6, { evaluate: true });
  });

  await db.collection("ots_dispatches").insertMany(dispatches);
  await db.collection("ots_assignments").insertMany(assignments);
  if (attempts.length) await db.collection("ots_attempts").insertMany(attempts);
  if (certs.length) await db.collection("ots_certificates").insertMany(certs);
  await db.collection("ots_activity_logs").insertMany(logs);
  await db.collection("ots_counters").updateOne({ _id: "question_code" }, { $max: { seq: 0 } }, { upsert: true });

  // Notifications into the platform's existing stores (staff bell / portal bell) for the demo logins only.
  const staffByEmp = new Map(Object.values(users).filter((u) => u.empId).map((u) => [u.empId, u.id]));
  const staffN = [];
  const portalN = [];
  for (const n of notices) {
    if (n.ref.kind === "employee" && staffByEmp.has(n.ref.id))
      staffN.push({ _id: `${D}n-${staffN.length + 1}`, recipientUserId: staffByEmp.get(n.ref.id), type: "ots_assigned", title: n.title, body: null, link: `/evaliq/my-tests/${n.a._id}`, read: false, dedupeKey: `ots_assigned:${n.a._id}:${staffByEmp.get(n.ref.id)}`, createdAt: n.when });
    if ((n.ref.kind === "applicant" && n.ref.id === appId.toString()) || (n.ref.kind === "student" && n.ref.id === studentId))
      portalN.push({ _id: `${D}pn-${portalN.length + 1}`, recipientUserId: n.ref.kind === "applicant" ? `${D}portal-1` : `${D}portal-2`, type: "ots_assigned", title: n.title, body: n.a.dueAt ? "Complete it before the due date." : null, link: `/clientos/tests/${n.a._id}`, read: false, dedupeKey: null, createdAt: n.when });
  }
  await db.collection("chat_notifications").deleteMany({ _id: new RegExp(`^${D}`) });
  if (staffN.length) await db.collection("chat_notifications").insertMany(staffN);
  if (portalN.length) await db.collection("external_notifications").insertMany(portalN);

  // Screening tests for every role on the careers page, assigned to that role's real applicants.
  const careers = await seedOtsCareers(db, { actorId: actor.id, evaluatorId: users.evaluator.id });

  return {
    careers,
    questions: qdocs.length,
    tests: testDocs.length,
    dispatches: dispatches.length,
    assignments: assignments.length,
    attempts: attempts.length,
    pendingEvaluation: attempts.filter((x) => x.status === "pending_evaluation").length,
    certificates: certs.length,
  };
}
