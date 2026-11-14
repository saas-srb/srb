import type { FaqHubGroup } from "@/lib/platform/saas/faqs";
import { productPath } from "@/lib/platform/saas/product-routes";

export const PEOPLE_TRAINING_SECURITY_FAQS: FaqHubGroup[] = [
  {
    id: "cohort-ai",
    title: "SRB Cohort AI",
    href: productPath("tms"),
    items: [
      {
        q: "What does Cohort AI help a training team manage?",
        a: "It covers programmes, batches, applications and enrolment, classes and attendance, assignments and submissions, mentors, placements, fees and certificates.",
        evidence: ["docs/products.md:104-114", "src/lib/products/cohort-ai/programs.ts:79-143", "src/lib/products/cohort-ai/assignments.ts:103-184"],
      },
      {
        q: "Can a programme represent either industrial training or an internship?",
        a: "Yes. Programmes have an Industrial Training or Internship Program category.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:11-25", "src/lib/products/cohort-ai/programs.ts:27-50"],
      },
      {
        q: "What delivery modes can I use for a programme?",
        a: "The available training modes are online, offline and hybrid.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:61-78", "src/lib/products/cohort-ai/validation.ts:1-60"],
      },
      {
        q: "What programme statuses are available?",
        a: "Programmes can be Draft, Active or Archived. Draft is the default status; only Active is marked as live in the shared status definition.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:30-55", "src/lib/products/cohort-ai/programs.ts:219-273"],
      },
      {
        q: "Can staff keep a programme unpublished while preparing it?",
        a: "Yes. Create a programme in Draft, then change its status when it is ready to become active.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:30-55", "src/lib/products/cohort-ai/programs.ts:219-257"],
      },
      {
        q: "How are programme records identified?",
        a: "Cohort AI generates programme codes from a sequence rather than requiring staff to invent a code for every programme.",
        evidence: ["src/lib/products/cohort-ai/programs.ts:79-87", "src/lib/products/cohort-ai/programs.ts:219-243"],
      },
      {
        q: "Can I configure programme categories and certificate numbering?",
        a: "Cohort AI has product-wide settings for editable programme categories, supported currencies, technologies and the certificate-number format.",
        evidence: ["src/lib/products/cohort-ai/settings.ts:12-43", "src/lib/products/cohort-ai/constants.ts:280-322"],
      },
      {
        q: "What is a batch used for?",
        a: "A batch is a scheduled group under a programme. Cohort AI provides batch records, rosters and a calendar view for the training schedule.",
        evidence: ["src/lib/products/cohort-ai/batches.ts:89-158", "src/lib/products/cohort-ai/batches.ts:285-319", "src/app/(products)/cohort-ai/(protected)/(staff)/batches/calendar/page.tsx:1-48"],
      },
      {
        q: "What lifecycle statuses can a batch have?",
        a: "Batches can be Upcoming, Running, Completed or Cancelled.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:85-105", "src/lib/products/cohort-ai/batches.ts:358-404"],
      },
      {
        q: "Can staff see a batch roster and enrolment count?",
        a: "Yes. Batch data includes enrolled counts and a roster, and batches can be listed or searched with filters.",
        evidence: ["src/lib/products/cohort-ai/batches.ts:89-158", "src/lib/products/cohort-ai/batches.ts:234-284"],
      },
      {
        q: "Can a batch be tied to a specific programme?",
        a: "Yes. Batches are associated with a programme, and the product can list batches belonging to one programme.",
        evidence: ["src/lib/products/cohort-ai/batches.ts:295-319", "src/lib/products/cohort-ai/batches.ts:358-392"],
      },
      {
        q: "Can staff check which batches are available for assignment?",
        a: "Cohort AI has a separate open-batch picker for assignment workflows, in addition to its normal batch listings.",
        evidence: ["src/lib/products/cohort-ai/batches.ts:302-319", "src/app/(products)/cohort-ai/(protected)/(staff)/batches/page.tsx:1-120"],
      },
      {
        q: "Can I export batch data?",
        a: "Yes. The batch data layer includes an export function, and the product exposes a batch export route.",
        evidence: ["src/lib/products/cohort-ai/batches.ts:329-335", "src/app/(products)/api/commandos/tms/batches/export/route.ts:1-41"],
      },
      {
        q: "Can one student enrol in more than one batch?",
        a: "Enrolment is represented per student and batch, so a student may have separate enrolment records for different batches.",
        evidence: ["src/lib/products/cohort-ai/enrollments.ts:16-32", "src/lib/products/cohort-ai/enrollments.ts:60-103"],
      },
      {
        q: "Will the same student be enrolled twice in the same batch?",
        a: "No. The enrolment operation rejects an existing student-and-batch enrolment rather than creating a duplicate.",
        evidence: ["src/lib/products/cohort-ai/enrollments.ts:104-155"],
      },
      {
        q: "Can I accidentally enrol a student in a batch from another programme?",
        a: "The enrolment validation checks that the selected batch belongs to the expected programme and returns an error when it does not.",
        evidence: ["src/lib/products/cohort-ai/enrollments.ts:120-155"],
      },
      {
        q: "Can staff update an existing enrolment?",
        a: "Yes. The enrolment data layer has a distinct update operation for an existing student-batch enrolment.",
        evidence: ["src/lib/products/cohort-ai/enrollments.ts:156-168"],
      },
      {
        q: "Can a student review their programme and batch information?",
        a: "The learner area has separate My Program and My Batch screens, populated from the signed-in student's Cohort AI records.",
        evidence: ["src/lib/products/cohort-ai/student-dashboard.ts:34-106", "src/app/(products)/cohort-ai/(protected)/me/program/page.tsx:1-91", "src/app/(products)/cohort-ai/(protected)/me/batch/page.tsx:1-70"],
      },
      {
        q: "Can staff schedule classes for a batch?",
        a: "Yes. Class schedules are linked to batches and have create, update, delete, upcoming and past-class operations.",
        evidence: ["src/lib/products/cohort-ai/classes.ts:188-239", "src/lib/products/cohort-ai/classes.ts:342-387"],
      },
      {
        q: "What status can a scheduled class have?",
        a: "A class can be Scheduled, Completed or Cancelled.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:157-168", "src/lib/products/cohort-ai/classes.ts:342-379"],
      },
      {
        q: "Can learners see upcoming classes?",
        a: "Yes. Cohort AI selects upcoming classes for the learner's enrolled batches and provides a learner-facing class schedule.",
        evidence: ["src/lib/products/cohort-ai/classes.ts:204-215", "src/app/(products)/cohort-ai/(protected)/me/schedule/page.tsx:1-73"],
      },
      {
        q: "Can staff record attendance against a class?",
        a: "Yes. Attendance is recorded for a class and the product provides both student-level and batch-level attendance summaries.",
        evidence: ["src/lib/products/cohort-ai/classes.ts:240-341", "src/app/(products)/cohort-ai/(protected)/(staff)/classes/[id]/page.tsx:1-116"],
      },
      {
        q: "Which attendance outcomes can be recorded?",
        a: "Attendance statuses include Present, Late, Absent and Excused. Present and Late count as attended in the shared constants.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:169-181", "src/lib/products/cohort-ai/classes.ts:267-297"],
      },
      {
        q: "Can I see an attendance rate by batch?",
        a: "Yes. Cohort AI calculates a batch attendance summary and includes a per-batch attendance report.",
        evidence: ["src/lib/products/cohort-ai/classes.ts:312-341", "src/lib/products/cohort-ai/reports.ts:24-70"],
      },
      {
        q: "Can staff create assignments for enrolled learners?",
        a: "Yes. Assignments can be listed for students, and the learner assignment view is based on the student's own records and enrolled batches.",
        evidence: ["src/lib/products/cohort-ai/assignments.ts:160-265", "src/app/(products)/cohort-ai/(protected)/me/assignments/page.tsx:1-56"],
      },
      {
        q: "Can learners submit their assignment work through Cohort AI?",
        a: "Yes. The product has a submission operation and a learner assignment screen; staff can view submissions for an assignment.",
        evidence: ["src/lib/products/cohort-ai/assignments.ts:184-230", "src/lib/products/cohort-ai/assignments.ts:285-340"],
      },
      {
        q: "Can staff review a learner's submission?",
        a: "Yes. Submission review is an explicit operation separate from the learner's submission action.",
        evidence: ["src/lib/products/cohort-ai/assignments.ts:285-340", "src/app/(products)/cohort-ai/(protected)/(staff)/assignments/[id]/page.tsx:1-77"],
      },
      {
        q: "Can a learner see only their own assignments?",
        a: "The learner assignment query is keyed by student ID and includes assignments associated with that learner's enrolled batches.",
        evidence: ["src/lib/products/cohort-ai/assignments.ts:231-265", "src/app/(products)/cohort-ai/(protected)/me/assignments/actions.ts:1-49"],
      },
      {
        q: "Can staff select mentors from existing people records?",
        a: "Yes. Cohort AI provides mentor options and resolves mentor IDs to display names rather than maintaining a separate mentor directory.",
        evidence: ["src/lib/products/cohort-ai/mentors.ts:1-65", "src/app/(products)/cohort-ai/(protected)/(staff)/batches/[id]/page.tsx:1-140"],
      },
      {
        q: "Can staff record a learner's placement?",
        a: "Yes. Cohort AI provides placement records with create, update, list and delete operations.",
        evidence: ["src/lib/products/cohort-ai/placements.ts:39-141", "src/app/(products)/cohort-ai/(protected)/(staff)/placements/page.tsx:1-118"],
      },
      {
        q: "Can placement information contribute to programme reporting?",
        a: "Placement records are included in the training operations area, and Cohort AI's dashboard derives placement counts and placement success reporting from its records.",
        evidence: ["src/lib/products/cohort-ai/placements.ts:94-141", "src/lib/products/cohort-ai/dashboard.ts:1-170", "src/app/(products)/cohort-ai/(protected)/(staff)/page.tsx:1-130"],
      },
      {
        q: "Can I set up a fee plan for a student?",
        a: "Yes. Cohort AI supports payment plans linked to student and programme records, with create and update operations.",
        evidence: ["src/lib/products/cohort-ai/payments.ts:68-114", "src/lib/products/cohort-ai/payments.ts:311-351"],
      },
      {
        q: "Can a fee plan include multiple instalments?",
        a: "Yes. The payment-plan model supports instalments, and staff can add or remove an instalment from an existing plan.",
        evidence: ["src/lib/products/cohort-ai/payments.ts:68-114", "src/lib/products/cohort-ai/payments.ts:352-442"],
      },
      {
        q: "Can a learner review their payment information?",
        a: "Yes. There is a learner payments screen and a student-specific payment-plan query.",
        evidence: ["src/lib/products/cohort-ai/payments.ts:174-199", "src/app/(products)/cohort-ai/(protected)/me/payments/page.tsx:1-90"],
      },
      {
        q: "Can staff export fee-plan records?",
        a: "Yes. Cohort AI has a payment-plan export operation and payment analytics for the training business.",
        evidence: ["src/lib/products/cohort-ai/payments.ts:200-310", "src/app/(products)/api/commandos/tms/payments/export/route.ts:1-36"],
      },
      {
        q: "Can Cohort AI issue a certificate after training?",
        a: "Yes. Staff can issue certificates and view certificates for individual students; public verification uses a verification code.",
        evidence: ["docs/products.md:106-108", "src/lib/products/cohort-ai/certificates.ts:86-136", "src/lib/products/cohort-ai/certificates.ts:229-251"],
      },
      {
        q: "Can a learner download an issued certificate?",
        a: "The learner certificates area and certificate PDF endpoint allow access to an issued certificate; availability depends on one having been issued.",
        evidence: ["src/lib/products/cohort-ai/certificates.ts:157-188", "src/app/(products)/cohort-ai/(protected)/me/certificates/page.tsx:1-77", "src/app/(products)/api/cohort-ai/certificates/[id]/pdf/route.ts:1-52"],
      },
      {
        q: "Can a certificate be revoked or reissued?",
        a: "Yes. Staff operations support changing a certificate's revoked state and reissuing a certificate.",
        evidence: ["src/lib/products/cohort-ai/certificates.ts:252-286", "src/app/(products)/cohort-ai/(protected)/(staff)/certificates/actions.ts:1-124"],
      },
      {
        q: "Can certificates be exported for record keeping?",
        a: "Yes. Certificate records have an export operation and an API export route.",
        evidence: ["src/lib/products/cohort-ai/certificates.ts:190-228", "src/app/(products)/api/commandos/tms/certificates/export/route.ts:1-34"],
      },
      {
        q: "Can students work on live projects in Cohort AI?",
        a: "Yes. Cohort AI has live projects with progress and milestones, and students have a separate view of projects associated with them.",
        evidence: ["src/lib/products/cohort-ai/projects.ts:63-96", "src/lib/products/cohort-ai/projects.ts:162-242", "src/app/(products)/cohort-ai/(protected)/me/projects/page.tsx:1-92"],
      },
      {
        q: "Can staff track project milestones?",
        a: "Yes. The live-project data layer has a milestone toggle operation, separate from editing the project itself.",
        evidence: ["src/lib/products/cohort-ai/projects.ts:193-242", "src/app/(products)/cohort-ai/(protected)/(staff)/projects/[id]/page.tsx:1-125"],
      },
      {
        q: "Can staff track a student's lifecycle status?",
        a: "Student records have Active, Completed, Dropped and On Hold states, and staff can update a student record.",
        evidence: ["src/lib/products/cohort-ai/constants.ts:137-156", "src/lib/products/cohort-ai/students.ts:210-246"],
      },
      {
        q: "Does Cohort AI generate student codes?",
        a: "Yes. Student codes are generated by a dedicated code-generation function in the student data layer.",
        evidence: ["src/lib/products/cohort-ai/students.ts:96-100", "src/lib/products/cohort-ai/students.ts:210-234"],
      },
      {
        q: "Can I export student records?",
        a: "Yes. Student records can be exported through a dedicated export operation.",
        evidence: ["src/lib/products/cohort-ai/students.ts:145-209", "src/app/(products)/api/commandos/tms/students/export/route.ts:1-44"],
      },
      {
        q: "What training reports are available?",
        a: "Cohort AI defines reports for training operations, including programme and attendance reporting; report contents are built from the product's records.",
        evidence: ["src/lib/products/cohort-ai/reports.ts:1-70", "src/app/(products)/cohort-ai/(protected)/(staff)/reports/page.tsx:1-58"],
      },
      {
        q: "Can learners update their own profile?",
        a: "The learner portal includes a profile page with its own profile actions; staff continue to manage the wider student record.",
        evidence: ["src/app/(products)/cohort-ai/(protected)/me/profile/page.tsx:1-24", "src/app/(products)/cohort-ai/(protected)/me/profile/actions.ts:1-55", "src/lib/products/cohort-ai/students.ts:210-246"],
      },
      {
        q: "Where can learners find training-related notices?",
        a: "The learner portal includes a notifications area, and Cohort AI has notification operations for training events.",
        evidence: ["src/lib/products/cohort-ai/notifications.ts:1-140", "src/app/(products)/cohort-ai/(protected)/notifications/page.tsx:1-33"],
      },
    ],
  },
  {
    id: "evaliq",
    title: "SRB EvalIQ",
    href: productPath("ots"),
    items: [
      {
        q: "What kinds of assessments can EvalIQ support?",
        a: "The test-type list includes practice, assessment, examination, mock, screening, certification, training, interview and custom tests.",
        evidence: ["docs/products.md:182-201", "src/lib/products/evaliq/constants.ts:6-18"],
      },
      {
        q: "How many question types are available?",
        a: "EvalIQ has 17 registered types spanning objective, text, technical, matching and media questions.",
        evidence: ["docs/products.md:186-188", "src/lib/products/evaliq/question-types.ts:14-42"],
      },
      {
        q: "Can I write single-choice questions?",
        a: "Yes. Single Choice is a registered question type and is automatically gradable.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:176-205"],
      },
      {
        q: "Can a question accept more than one selected answer?",
        a: "Yes. Multiple Choice and Multiple Select are separate question types with their own selection and grading behavior.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:176-250"],
      },
      {
        q: "Can I create true/false or yes/no questions?",
        a: "Yes. Both are built-in types with fixed answer options, so authors select the correct value rather than maintaining arbitrary choices.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:168-176"],
      },
      {
        q: "Can EvalIQ grade short answers automatically?",
        a: "Short-answer questions can list accepted answers and configure case sensitivity; the question type registry uses those settings when grading.",
        evidence: ["src/lib/products/evaliq/question-types.ts:66-71", "src/lib/products/evaliq/question-types.ts:256-310"],
      },
      {
        q: "How are long-answer questions evaluated?",
        a: "Long-answer questions can include a rubric and are not necessarily auto-gradable; subjective responses can be sent to manual evaluation.",
        evidence: ["src/lib/products/evaliq/question-types.ts:66-71", "src/lib/products/evaliq/evaluation.ts:36-95", "docs/products.md:194-197"],
      },
      {
        q: "Can a question ask learners to fill in blanks?",
        a: "Yes. Authors can define accepted answers for each blank placeholder, including alternate accepted text.",
        evidence: ["src/lib/products/evaliq/question-types.ts:72-77", "src/lib/products/evaliq/question-types.ts:311-354"],
      },
      {
        q: "Can EvalIQ assess code output?",
        a: "Yes. Code Output questions can specify a language, code snippet and accepted output answers.",
        evidence: ["src/lib/products/evaliq/question-types.ts:78-86", "src/lib/products/evaliq/question-types.ts:355-403"],
      },
      {
        q: "Can candidates write code or SQL in an assessment?",
        a: "Coding and SQL Query are supported technical question types; SQL questions can include a schema for the query context.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:78-89", "docs/products.md:186-188"],
      },
      {
        q: "Can an assessment ask candidates to debug a snippet?",
        a: "Yes. Debugging is a registered type and uses the technical question definition, including code and a rubric.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:78-89"],
      },
      {
        q: "Can I ask matching or ordering questions?",
        a: "Yes. Match Following stores left/right pairs, while Ordering stores the correct sequence of items.",
        evidence: ["src/lib/products/evaliq/question-types.ts:90-98", "src/lib/products/evaliq/question-types.ts:404-456"],
      },
      {
        q: "Can questions include images, audio or video?",
        a: "Yes. Image-Based, Audio-Based and Video-Based are registered media types, and those types require their corresponding media.",
        evidence: ["src/lib/products/evaliq/question-types.ts:14-35", "src/lib/products/evaliq/question-types.ts:103-116", "src/lib/products/evaliq/questions.ts:1-76"],
      },
      {
        q: "Are question answer keys exposed to candidates?",
        a: "The question engine creates a public definition that omits the answer key; candidate attempts use that public form rather than the raw author definition.",
        evidence: ["src/lib/products/evaliq/question-types.ts:1-12", "src/lib/products/evaliq/question-types.ts:105-110", "src/lib/products/evaliq/attempt-types.ts:18-31"],
      },
      {
        q: "Can I reuse a question in multiple tests?",
        a: "Yes. Questions are held in a reusable bank, and the question pages describe writing a question once for use in any number of tests.",
        evidence: ["docs/products.md:186-188", "src/app/(products)/evaliq/(protected)/questions/new/page.tsx:1-20", "src/lib/products/evaliq/questions.ts:134-182"],
      },
      {
        q: "Can I archive a question without losing historical attempts?",
        a: "Yes. Archived questions remain in tests that selected them manually and in past results, while automatic selection rules stop drawing them.",
        evidence: ["src/app/(products)/evaliq/(protected)/questions/page.tsx:1-120", "src/lib/products/evaliq/questions.ts:157-182"],
      },
      {
        q: "Can staff duplicate an existing question?",
        a: "Yes. The question bank offers a Duplicate action, and the business logic creates the duplicate as a draft.",
        evidence: ["src/app/(products)/evaliq/(protected)/questions/page.tsx:1-120", "src/lib/products/evaliq/questions.ts:150-162"],
      },
      {
        q: "Can I import a question bank from a spreadsheet?",
        a: "Yes. EvalIQ reads CSV or XLSX files, then normalizes and validates rows before optionally committing valid questions.",
        evidence: ["docs/products.md:186-188", "src/lib/products/evaliq/questions.ts:456-521"],
      },
      {
        q: "Does one invalid spreadsheet row block every imported question?",
        a: "No. Import rows are independent; the importer previews row-level errors and can create the valid rows without rejecting the entire sheet.",
        evidence: ["src/lib/products/evaliq/questions.ts:494-521"],
      },
      {
        q: "Can I export questions from EvalIQ?",
        a: "Yes. The question bank has export support and the spreadsheet row mapping includes question type, prompt, answers, tags, code and media fields.",
        evidence: ["src/lib/products/evaliq/questions.ts:261-270", "src/lib/products/evaliq/questions.ts:416-455", "src/lib/products/evaliq/exports.ts:1-114"],
      },
      {
        q: "What categories and difficulty levels can I use for questions?",
        a: "Questions can use configured categories and a per-question difficulty from Beginner through Expert; Mixed is reserved for whole-test difficulty.",
        evidence: ["src/lib/products/evaliq/constants.ts:19-29", "src/lib/products/evaliq/categories.ts:1-87", "src/lib/products/evaliq/questions.ts:77-133"],
      },
      {
        q: "What details can a question store besides its prompt?",
        a: "The question model includes subject, topic, difficulty, marks, negative marks, explanation, tags, status, media and a type-specific definition.",
        evidence: ["src/lib/products/evaliq/questions.ts:25-76", "src/lib/products/evaliq/questions.ts:77-133"],
      },
      {
        q: "Can a test use its own category and subject?",
        a: "Yes. The test builder includes a category, test type, subject, difficulty, department/designation context, instructions and tags.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:5-24", "src/lib/products/evaliq/tests.ts:214-235"],
      },
      {
        q: "What statuses does a test move through?",
        a: "Stored statuses include Draft, Published, Closed and Archived; Active is derived from a published test's availability window.",
        evidence: ["src/lib/products/evaliq/constants.ts:31-40", "src/lib/products/evaliq/tests.ts:161-177"],
      },
      {
        q: "Can a test contain multiple sections?",
        a: "Yes. Test sections can hold a title, description, time limit, question IDs or selection rules, marks per question and negative-marking behavior.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:40-62", "src/lib/products/evaliq/tests.ts:282-341"],
      },
      {
        q: "Can a test draw questions using rules instead of only hand-picked IDs?",
        a: "Yes. A section can include rules that select matching questions from the bank, and the question engine can count or list a rule's available pool.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:40-62", "src/lib/products/evaliq/questions.ts:292-345"],
      },
      {
        q: "Can each attempt receive only part of a question pool?",
        a: "Yes. The test configuration supports a questions-per-attempt setting, and the paper builder assembles the attempt's question set.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/paper.ts:22-79"],
      },
      {
        q: "Can I randomize question order and answer options?",
        a: "Yes. Test configuration has separate settings for randomizing questions and randomizing options.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/question-types.ts:144-151"],
      },
      {
        q: "Can a test have an overall timer?",
        a: "Yes. Tests can have a duration and auto-submit setting; timed attempts carry server-side deadlines.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/attempt-types.ts:91-100", "src/lib/products/evaliq/attempts.ts:94-221"],
      },
      {
        q: "Can individual sections have their own timers?",
        a: "Yes. A section can have a time limit, and a sequential section is locked after the candidate finishes it and advances.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:40-62", "src/lib/products/evaliq/attempts.ts:351-423", "src/lib/products/evaliq/attempts.ts:471-502"],
      },
      {
        q: "Can I choose whether candidates can navigate freely?",
        a: "Yes. Configuration controls question navigation, going back and review; tests can also use free or sequential section mode. The server checks the navigation rules when candidates move or save answers.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/attempts.ts:425-502"],
      },
      {
        q: "Can wrong answers reduce a candidate's score?",
        a: "Yes. Negative marks can be configured for the test or a section; skipped questions are not treated as wrong answers for negative marking.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/attempt-types.ts:47-63", "src/lib/products/evaliq/candidate.ts:1-100"],
      },
      {
        q: "Can a test limit the number of attempts?",
        a: "Yes. Test configuration supports a maximum number of attempts, retakes and retakes only when the previous attempt failed.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/assignments.ts:118-160"],
      },
      {
        q: "Which score is used when someone takes a test more than once?",
        a: "The configured attempt-scoring rule can use the latest attempt, the highest score or the average score.",
        evidence: ["src/lib/products/evaliq/constants.ts:104-111", "src/lib/products/evaliq/test-draft.ts:26-39"],
      },
      {
        q: "Can I schedule when a test becomes available?",
        a: "Yes. Tests and assignments have start/end availability dates; status and access are evaluated against the configured window.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/tests.ts:161-177", "src/lib/products/evaliq/assignments.ts:130-160"],
      },
      {
        q: "Can a test be assigned to a whole department or team?",
        a: "Yes. Assignment targets include HRMS departments, designations, teams and employment types, as well as individual staff and platform roles.",
        evidence: ["src/lib/products/evaliq/constants.ts:139-169", "src/lib/products/evaliq/assignments.ts:161-222"],
      },
      {
        q: "Can EvalIQ assign tests to applicants or learners?",
        a: "Yes. Assignment targets include applicants by position and individual applicants, individual students and training-related audiences.",
        evidence: ["docs/products.md:190-192", "src/lib/products/evaliq/constants.ts:139-180", "src/lib/products/evaliq/people.ts:86-147"],
      },
      {
        q: "Are group assignments resolved from current people records?",
        a: "Yes. Assignment targets resolve live from HRMS, Careers and training sources; staff can re-sync a dispatch to pick up newly matching people.",
        evidence: ["docs/products.md:190-193", "src/lib/products/evaliq/people.ts:148-313", "src/lib/products/evaliq/assignments.ts:306-321"],
      },
      {
        q: "Does re-sync duplicate an active assignment for the same person?",
        a: "The assignment rules treat assigned, in-progress, submitted and evaluated states as active when preventing a duplicate assignment of the same test to the same person.",
        evidence: ["src/lib/products/evaliq/constants.ts:56-64", "src/lib/products/evaliq/assignments.ts:223-305"],
      },
      {
        q: "Can employees, applicants and students all take assessments?",
        a: "Yes. Candidate records support employees, staff users, applicants and students; the product uses staff and portal channels for their candidate flows.",
        evidence: ["src/lib/products/evaliq/constants.ts:115-138", "src/lib/products/evaliq/taker.ts:1-61", "docs/products.md:182-185"],
      },
      {
        q: "Can an assignment include instructions for its candidate?",
        a: "Yes. Assignment instructions and test instructions are combined in the candidate's exam state.",
        evidence: ["src/lib/products/evaliq/assignments.ts:173-207", "src/lib/products/evaliq/attempts.ts:351-385"],
      },
      {
        q: "Does EvalIQ make online exams cheat-proof?",
        a: "No. Optional controls can make cheating harder and record visible signals, but they do not prove that an online exam is cheat-proof.",
        evidence: ["docs/products.md:192-194", "src/lib/products/evaliq/attempts.ts:503-528"],
      },
      {
        q: "What exam-security controls can a test configure?",
        a: "The test's security settings are supplied to the exam screen and include controls such as full-screen checks, tab-switch/copy events, single-session enforcement and a maximum violation count.",
        evidence: ["docs/products.md:192-194", "src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/attempts.ts:351-423", "src/lib/products/evaliq/attempts.ts:503-528"],
      },
      {
        q: "Can an attempt auto-submit after too many recorded violations?",
        a: "Yes. Security events increment a violation count, and the attempt configuration can trigger automatic submission after its configured limit.",
        evidence: ["src/lib/products/evaliq/attempts.ts:503-528", "src/lib/products/evaliq/attempts.ts:529-586", "src/lib/products/evaliq/constants.ts:78-87"],
      },
      {
        q: "Does EvalIQ record a candidate's connection details?",
        a: "Attempt records include starting and most recent IP information, user agent and whether the attempt came through the staff or portal channel.",
        evidence: ["docs/products.md:192-194", "src/lib/products/evaliq/attempt-types.ts:115-126", "src/lib/products/evaliq/attempts.ts:425-456"],
      },
      {
        q: "Can candidates flag a question and save their response?",
        a: "Yes. Answers record the response, a flagged state, whether the question was visited, time spent and when the answer was saved.",
        evidence: ["src/lib/products/evaliq/attempt-types.ts:44-53", "src/lib/products/evaliq/attempts.ts:425-456"],
      },
      {
        q: "Are objective questions graded automatically?",
        a: "Question types define their own grading behavior. Objective types are auto-gradable, while subjective types may remain pending until manually marked.",
        evidence: ["src/lib/products/evaliq/question-types.ts:103-105", "src/lib/products/evaliq/evaluation.ts:36-95", "docs/products.md:194-197"],
      },
      {
        q: "Can a staff member adjust an automatically graded answer?",
        a: "Yes. Evaluation outcomes track whether a mark was overridden, and staff can mark an individual item before the attempt is settled.",
        evidence: ["src/lib/products/evaliq/attempt-types.ts:8-17", "src/lib/products/evaliq/evaluation.ts:195-249"],
      },
      {
        q: "Can results show a provisional score before manual grading is done?",
        a: "Yes. Results are marked provisional while subjective answers are awaiting evaluation.",
        evidence: ["src/lib/products/evaliq/attempt-types.ts:72-88", "src/lib/products/evaliq/evaluation.ts:52-95"],
      },
      {
        q: "When can a candidate see results?",
        a: "A test can release results immediately, after manual evaluation, after the test closes, when a manager publishes them, or never to candidates.",
        evidence: ["src/lib/products/evaliq/constants.ts:89-103", "src/lib/products/evaliq/test-draft.ts:26-39"],
      },
      {
        q: "How much answer detail can the candidate see with results?",
        a: "Result detail can be score only, score plus the candidate's own responses, or score plus responses and correct answers.",
        evidence: ["src/lib/products/evaliq/constants.ts:97-103", "src/lib/products/evaliq/test-draft.ts:26-39"],
      },
      {
        q: "Can a test use a pass threshold?",
        a: "Yes. Tests can select a pass mode and configure passing marks or a passing percentage; the evaluation code calculates pass/fail.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/evaluation.ts:46-95"],
      },
      {
        q: "Can candidates review explanations after an attempt?",
        a: "Yes, test configuration includes a show-explanations option, subject to the configured result visibility and detail settings.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:26-39", "src/lib/products/evaliq/constants.ts:97-103"],
      },
      {
        q: "Can EvalIQ issue certificates for completed assessments?",
        a: "Yes. Tests can enable certificates with a title and validity period, and the certificate service supports issuing and revoking certificates.",
        evidence: ["src/lib/products/evaliq/test-draft.ts:5-24", "src/lib/products/evaliq/certificates.ts:113-159"],
      },
      {
        q: "What can staff learn from EvalIQ analytics?",
        a: "The analytics screens cover test and assignment performance, score distributions, pass/fail, departments, candidate types, test status and recent certificates.",
        evidence: ["src/app/(products)/evaliq/(protected)/page.tsx:1-120", "src/lib/products/evaliq/analytics.ts:94-261"],
      },
      {
        q: "Can reports be grouped by department or candidate audience?",
        a: "Yes. Analytics supports grouping by dimensions such as department, role/designation, candidate type, batch and course, using current people records.",
        evidence: ["src/app/(products)/evaliq/(protected)/analytics/page.tsx:1-98", "src/lib/products/evaliq/analytics.ts:262-387", "docs/products.md:190-197"],
      },
      {
        q: "Can staff export test reports?",
        a: "Yes. EvalIQ builds report exports and has a report screen for staff; available formats and report content depend on the selected export.",
        evidence: ["src/lib/products/evaliq/exports.ts:31-114", "src/app/(products)/evaliq/(protected)/reports/page.tsx:1-65"],
      },
      {
        q: "Can candidates review their own past attempts?",
        a: "Yes. The My Results area lists a candidate's attempt history and has a detail screen for an individual result.",
        evidence: ["src/app/(products)/evaliq/(protected)/my-results/page.tsx:1-30", "src/app/(products)/evaliq/(protected)/my-results/[attemptId]/page.tsx:1-19", "src/lib/products/evaliq/results.ts:27-67"],
      },
      {
        q: "Does EvalIQ have a separate global timer and security configuration?",
        a: "No. Product settings provide system-level settings, while timing, attempts, marking, results and security are configured per test in the test builder.",
        evidence: ["src/app/(products)/evaliq/(protected)/settings/page.tsx:1-28", "src/lib/products/evaliq/test-draft.ts:26-39"],
      },
    ],
  },
  {
    id: "playbook-ai",
    title: "SRB Playbook AI",
    href: productPath("sop"),
    items: [
      {
        q: "What is a Playbook AI SOP?",
        a: "It is a structured standard operating procedure with a purpose, scope, owned metadata and content that can be published, versioned, assigned and acknowledged.",
        evidence: ["docs/products.md:117-126", "src/lib/products/playbook-ai/sops.ts:179-282", "src/lib/products/playbook-ai/constants.ts:114-190"],
      },
      {
        q: "Can a new SOP be saved without publishing it?",
        a: "Yes. SOPs have a Draft state; a first publish requires a purpose, scope and some procedure content.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:26-43", "src/lib/products/playbook-ai/sops.ts:179-282", "src/lib/products/playbook-ai/sops.ts:454-480"],
      },
      {
        q: "Does Playbook AI have a separate approval stage before publication?",
        a: "The SOP lifecycle code describes Draft → Published → Active and explicitly says there is no review/approval state. Publication is a permission-controlled action.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:21-25", "src/lib/products/playbook-ai/access.ts:88-96", "src/lib/products/playbook-ai/sops.ts:454-480"],
      },
      {
        q: "What happens when an SOP is published?",
        a: "Publication creates a version snapshot containing the draft content and metadata, then marks the SOP live using that version.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:454-556", "src/lib/products/playbook-ai/types.ts:6-70"],
      },
      {
        q: "What content must an SOP contain to be published?",
        a: "It needs a purpose, a scope and at least one non-empty procedure block; later publications also require a change summary.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:454-480"],
      },
      {
        q: "Can an SOP's published version be overwritten in place?",
        a: "A publication inserts a new version document with a unique SOP/version index and updates the current live version; it does not replace the old snapshot.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:494-556", "src/lib/products/playbook-ai/sops.ts:153-168"],
      },
      {
        q: "Can I label a change as major or minor?",
        a: "Yes. Publishing accepts a major or minor change type and calculates the next version accordingly.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:454-493", "src/lib/products/playbook-ai/content.ts:329-335"],
      },
      {
        q: "Can staff compare SOP versions?",
        a: "Yes. The product includes a version-comparison page and line-diff helpers for published content.",
        evidence: ["src/lib/products/playbook-ai/content.ts:266-328", "src/app/(products)/playbook-ai/(protected)/library/[id]/compare/page.tsx:1-140"],
      },
      {
        q: "Can I restore a past SOP version?",
        a: "A past version can be loaded into the editable draft. The existing version history is left untouched, and publishing the restored content creates a new version.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:615-637"],
      },
      {
        q: "What happens if a published SOP is archived and then restored?",
        a: "A published SOP restores to a status derived from its effective and expiry dates; a never-published SOP restores as a draft.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:579-603", "src/lib/products/playbook-ai/lifecycle.ts:16-27"],
      },
      {
        q: "Can a published SOP be permanently discarded like a draft?",
        a: "No. The delete-draft operation only permits discarding a never-published draft; published SOPs should be archived instead.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:604-614", "src/lib/products/playbook-ai/access.ts:101-114"],
      },
      {
        q: "When does a published SOP become active?",
        a: "Its effective date determines whether a published SOP remains Published or becomes Active; expiry is derived separately.",
        evidence: ["src/lib/products/playbook-ai/lifecycle.ts:16-27", "src/lib/products/playbook-ai/sops.ts:506-522"],
      },
      {
        q: "Can an SOP have an expiry date?",
        a: "Yes. SOP metadata may include an expiry date; the lifecycle logic derives an Expired state when the date passes.",
        evidence: ["src/lib/products/playbook-ai/lifecycle.ts:16-27", "src/lib/products/playbook-ai/types.ts:6-70"],
      },
      {
        q: "Can I track when an SOP should be reviewed?",
        a: "Yes. SOPs have review dates, and Playbook AI has logic to identify overdue reviews and expiring SOPs.",
        evidence: ["src/lib/products/playbook-ai/lifecycle.ts:36-45", "src/lib/products/playbook-ai/sops.ts:506-522", "src/lib/products/playbook-ai/analytics.ts:116-180"],
      },
      {
        q: "Can procedures include steps and checklists?",
        a: "Yes. SOP blocks include numbered steps, bullet lists and checklists whose items can be tracked.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:114-166", "src/lib/products/playbook-ai/assignments.ts:39-48", "docs/products.md:117-121"],
      },
      {
        q: "Can I add a table to a procedure?",
        a: "Yes. The SOP content model includes table blocks with headers and rows.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:114-166", "src/lib/products/playbook-ai/content.ts:144-216"],
      },
      {
        q: "Can procedure content include images, videos, attachments or links?",
        a: "Yes. SOP blocks include image, video, attachment and link types, along with notes, warnings, examples and references.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:114-166", "src/lib/products/playbook-ai/content.ts:144-216"],
      },
      {
        q: "Can videos be external links or uploaded files?",
        a: "A video block may reference an uploaded file or a URL; content validation requires one of those sources.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:114-166", "src/lib/products/playbook-ai/sops.ts:430-453"],
      },
      {
        q: "Can checklist completion be tracked for an acknowledgement?",
        a: "Yes. Assignment records store checklist state, and employees can update checklist items separately from acknowledging an SOP.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:39-48", "src/lib/products/playbook-ai/assignments.ts:398-419"],
      },
      {
        q: "Which departments can SOPs belong to?",
        a: "Playbook AI has department taxonomy seeded with default departments and can also synchronize departments from HRMS.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:195-267", "src/lib/products/playbook-ai/taxonomy.ts:114-240", "src/lib/products/playbook-ai/people.ts:146-164"],
      },
      {
        q: "Can administrators add or rename SOP departments?",
        a: "Yes. Department taxonomy has create, update and delete operations, with permission checks and safeguards for linked records.",
        evidence: ["src/lib/products/playbook-ai/taxonomy.ts:241-309", "src/app/(products)/playbook-ai/(protected)/departments/page.tsx:1-62"],
      },
      {
        q: "Can department records stay aligned with HRMS?",
        a: "Yes. Playbook AI can synchronize HRMS departments into its taxonomy and stores the corresponding HRMS department reference.",
        evidence: ["src/lib/products/playbook-ai/taxonomy.ts:182-240", "src/lib/products/playbook-ai/people.ts:146-164"],
      },
      {
        q: "Can SOPs be organized into functions and processes?",
        a: "Yes. The taxonomy includes department, function, process and category layers, with dedicated operations for functions and processes.",
        evidence: ["src/lib/products/playbook-ai/taxonomy.ts:114-181", "src/lib/products/playbook-ai/taxonomy.ts:310-387"],
      },
      {
        q: "Can I create custom SOP categories?",
        a: "Yes. Categories are manageable taxonomy records rather than a fixed display-only list.",
        evidence: ["src/lib/products/playbook-ai/taxonomy.ts:388-419", "src/app/(products)/playbook-ai/(protected)/categories/page.tsx:1-37"],
      },
      {
        q: "Can an SOP target specific HR roles?",
        a: "Yes. SOP metadata can hold applicable role IDs, and mandatory assignment filters department members by those roles when present.",
        evidence: ["src/lib/products/playbook-ai/types.ts:6-70", "src/lib/products/playbook-ai/assignments.ts:251-287"],
      },
      {
        q: "What confidentiality levels are available?",
        a: "The levels are Internal, Department Only, Management Only, Confidential, Highly Confidential and Restricted, each with its own read-access rules.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:54-87", "src/lib/products/playbook-ai/access.ts:55-87"],
      },
      {
        q: "Can highly confidential or restricted SOPs be downloaded by default?",
        a: "No. Downloads are off by default when an SOP is created at the Highly Confidential or Restricted level; download access is also checked separately.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:85-87", "src/lib/products/playbook-ai/access.ts:114-117"],
      },
      {
        q: "Can someone receive access to an SOP without changing its department?",
        a: "Yes. The access model supports explicit grants, and managers can grant access within the defined permission rules.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:54-87", "src/lib/products/playbook-ai/access.ts:123-133"],
      },
      {
        q: "Can SOPs be assigned to individual employees?",
        a: "Yes. Staff can assign a published SOP to selected people; the assignment action resolves people and records due dates.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:187-250", "src/lib/products/playbook-ai/people.ts:84-136"],
      },
      {
        q: "Can a mandatory SOP be assigned automatically to a department?",
        a: "Yes. Publishing a mandatory SOP can assign it to members of its department, optionally filtered by applicable roles.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:251-287", "src/lib/products/playbook-ai/sops.ts:554-577"],
      },
      {
        q: "Can the assignee due date be set?",
        a: "Yes. A due date can be entered when assigning, and otherwise the product uses the configured default due period.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:187-230", "src/lib/products/playbook-ai/settings.ts:1-61"],
      },
      {
        q: "Does reassigning a person reset an existing acknowledgement?",
        a: "No. The assignment logic notes that reassigning someone who already has the SOP only updates an open due date and does not alter acknowledgement.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:165-185"],
      },
      {
        q: "Can employees see what has been assigned to them?",
        a: "Yes. Playbook AI includes Assigned SOPs and My SOPs views backed by user-specific assignment queries.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:49-60", "src/app/(products)/playbook-ai/(protected)/assigned/page.tsx:1-99", "src/app/(products)/playbook-ai/(protected)/my/page.tsx:1-36"],
      },
      {
        q: "Does simply opening an SOP record that it was viewed?",
        a: "Yes. Opening a readable assigned SOP can record its first viewed timestamp and a throttled audit event.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:320-337"],
      },
      {
        q: "Can employees formally acknowledge an SOP?",
        a: "Yes. Acknowledgement is a separate employee action, with the assignment storing acknowledgement time and version.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:368-397", "docs/products.md:117-123"],
      },
      {
        q: "Does acknowledgement show which SOP version was read?",
        a: "Yes. An assignment tracks the required version and acknowledged version, so an acknowledgement is associated with a particular release.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:39-48", "src/lib/products/playbook-ai/assignments.ts:368-397"],
      },
      {
        q: "Can a new SOP version require people to acknowledge it again?",
        a: "Yes. When a version is published, the publisher can request re-acknowledgement; if required, existing acknowledgements are reopened with a due date.",
        evidence: ["src/lib/products/playbook-ai/sops.ts:454-577", "src/lib/products/playbook-ai/assignments.ts:288-319"],
      },
      {
        q: "Can managers remind employees who have not acknowledged an SOP?",
        a: "Yes. Playbook AI can send reminders for pending acknowledgements and show overdue acknowledgements in the compliance screens.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:420-445", "src/app/(products)/playbook-ai/(protected)/compliance/page.tsx:1-140"],
      },
      {
        q: "Can employees send feedback about an SOP?",
        a: "Yes. Employees can submit a feedback or change request on an SOP; it is a suggestion channel rather than an edit to the published SOP.",
        evidence: ["src/lib/products/playbook-ai/feedback.ts:1-74"],
      },
      {
        q: "Can feedback be resolved by an SOP editor?",
        a: "Yes. Feedback can be listed and resolved by someone with the relevant SOP edit permission.",
        evidence: ["src/lib/products/playbook-ai/feedback.ts:75-116"],
      },
      {
        q: "What can the compliance view report?",
        a: "The compliance area includes acknowledgement rates by department and SOP, overdue acknowledgements, review/expiry status and mandatory SOPs without assignments.",
        evidence: ["src/lib/products/playbook-ai/analytics.ts:283-387", "src/app/(products)/playbook-ai/(protected)/compliance/page.tsx:1-140"],
      },
      {
        q: "Can I export acknowledgement or compliance data?",
        a: "Yes. Playbook AI export types include library, personal records, acknowledgements, compliance, reviews and audit data.",
        evidence: ["src/lib/products/playbook-ai/exports.ts:1-44", "src/app/(products)/playbook-ai/(protected)/reports/page.tsx:1-120"],
      },
      {
        q: "Are starter SOP templates available?",
        a: "Yes. Playbook AI can seed system templates, list and view templates, create or update them, and duplicate a template.",
        evidence: ["src/lib/products/playbook-ai/templates.ts:69-210", "src/app/(products)/playbook-ai/(protected)/templates/page.tsx:1-65"],
      },
      {
        q: "Can a template produce SOP sections?",
        a: "Yes. Template definitions have sections and can be converted into SOP sections when creating content.",
        evidence: ["src/lib/products/playbook-ai/templates.ts:125-155", "src/lib/products/playbook-ai/templates.ts:203-210"],
      },
      {
        q: "Can SOPs attach supporting files?",
        a: "Yes. Files can be uploaded and listed for a SOP; file reads go through the authenticated route, which checks SOP read access.",
        evidence: ["src/lib/products/playbook-ai/files.ts:1-57", "src/lib/products/playbook-ai/files.ts:58-110", "src/app/(products)/api/playbook-ai/files/[id]/route.ts:1-87"],
      },
      {
        q: "Can the product export audit activity?",
        a: "Yes. The audit trail can be filtered and listed, and audit is one of the supported Playbook AI export types.",
        evidence: ["src/lib/products/playbook-ai/audit.ts:1-206", "src/lib/products/playbook-ai/exports.ts:31-120"],
      },
      {
        q: "What kinds of changes are recorded in the SOP audit trail?",
        a: "The audit model covers SOP, version, assignment, file and feedback entities and records actions such as publication, assignment and restoration.",
        evidence: ["src/lib/products/playbook-ai/audit.ts:1-84", "src/lib/products/playbook-ai/sops.ts:540-578", "src/lib/products/playbook-ai/sops.ts:592-603"],
      },
      {
        q: "Can an SOP link to one of the other SRB products?",
        a: "Yes. SOP metadata can tag the product module it supports, including HRMS, projects, procurement, finance, training, sales/CRM or team chat.",
        evidence: ["src/lib/products/playbook-ai/constants.ts:80-94", "src/lib/products/playbook-ai/types.ts:6-70"],
      },
      {
        q: "Can administrators configure review and reminder defaults?",
        a: "Yes. Settings include the default review interval, default assignment due period, reminder repeat interval and the default re-acknowledgement behavior for new versions.",
        evidence: ["src/lib/products/playbook-ai/settings.ts:5-54"],
      },
      {
        q: "Can someone acknowledge a readable SOP that was not directly assigned to them?",
        a: "Yes. The acknowledgement path can create a self-acknowledged assignment record for the current viewer when one does not already exist.",
        evidence: ["src/lib/products/playbook-ai/assignments.ts:340-397", "src/lib/products/playbook-ai/access.ts:118-122"],
      },
    ],
  },
  {
    id: "cybervault",
    title: "SRB CyberVault",
    href: productPath("dlms"),
    items: [
      {
        q: "What kinds of records can CyberVault store?",
        a: "CyberVault stores credentials, documents, URL/account records and notes.",
        evidence: ["docs/products.md:167-178", "src/lib/products/cybervault/constants.ts:9-16"],
      },
      {
        q: "Can a record belong to the company or to a client?",
        a: "Yes. Each record has either company scope or client scope; a client-scoped record refers to one client.",
        evidence: ["docs/products.md:167-174", "src/lib/products/cybervault/constants.ts:5-7", "src/lib/products/cybervault/records.ts:47-56"],
      },
      {
        q: "Does CyberVault manage client master records?",
        a: "No. Client records remain in the client master; CyberVault stores a reference to that client and builds a vault profile from its credentials, URLs, documents, notes and expiry data.",
        evidence: ["docs/products.md:173-177", "src/lib/products/cybervault/access.ts:93-110"],
      },
      {
        q: "What information can a credential record contain?",
        a: "A credential can contain a name, category, username, login URL, encrypted password, expiry date and notes.",
        evidence: ["src/lib/products/cybervault/records.ts:47-64", "src/lib/products/cybervault/constants.ts:23-35"],
      },
      {
        q: "Which kinds of credentials can I categorize?",
        a: "Credential categories include admin, hosting, cloud, domain, email, social/platform, government portal, SaaS, API, database/server and other.",
        evidence: ["src/lib/products/cybervault/constants.ts:23-35"],
      },
      {
        q: "Can a credential record include the service's sign-in page?",
        a: "Yes. Credential records have a login URL field in addition to a username and password.",
        evidence: ["src/lib/products/cybervault/records.ts:58-64", "src/lib/products/cybervault/records.ts:452-515"],
      },
      {
        q: "Are URLs and accounts stored as credential records?",
        a: "They are a separate URL / Account record type, with its own URL, account label and optional link to a credential.",
        evidence: ["src/lib/products/cybervault/constants.ts:9-16", "src/lib/products/cybervault/records.ts:83-88", "src/lib/products/cybervault/records.ts:621-644"],
      },
      {
        q: "Can I link a URL/account record to a saved credential?",
        a: "Yes. A link record may reference a credential; the linked credential's name is shown only when the viewer may also see that credential.",
        evidence: ["src/lib/products/cybervault/records.ts:83-88", "src/lib/products/cybervault/records.ts:336-349"],
      },
      {
        q: "Which categories are available for URL and account records?",
        a: "The type list includes website, admin URL, hosting, Git repository, cloud account, email account, domain account, third-party service, government portal and other link.",
        evidence: ["src/lib/products/cybervault/constants.ts:51-62"],
      },
      {
        q: "Can CyberVault keep documents with multiple versions?",
        a: "Yes. A document stores version metadata and a current-version number; adding a version appends another version rather than replacing the version history.",
        evidence: ["docs/products.md:176-177", "src/lib/products/cybervault/records.ts:65-82", "src/lib/products/cybervault/records.ts:547-620"],
      },
      {
        q: "Can document versions include a note about the upload?",
        a: "Yes. Each stored document-version record can include an upload note along with filename, content type, size, uploader and upload time.",
        evidence: ["src/lib/products/cybervault/records.ts:65-76", "src/lib/products/cybervault/records.ts:590-620"],
      },
      {
        q: "What document categories are available?",
        a: "Categories include agreements, contracts, KYC, company and client documents, project documents, certificates, licenses, government documents, credential documents and other.",
        evidence: ["src/lib/products/cybervault/constants.ts:37-49"],
      },
      {
        q: "Can I store notes separately from documents?",
        a: "Yes. Notes are first-class records with a body and their own note category, separate from document files.",
        evidence: ["src/lib/products/cybervault/constants.ts:9-16", "src/lib/products/cybervault/records.ts:89-91", "src/lib/products/cybervault/records.ts:645-669"],
      },
      {
        q: "What can I classify a vault note as?",
        a: "Note types include access instructions, setup information, deployment notes, credential information, account instructions, business information and general notes.",
        evidence: ["src/lib/products/cybervault/constants.ts:64-72"],
      },
      {
        q: "Who can see company-vault records?",
        a: "Managers see every scope; other users need company-vault access in addition to the applicable view permission.",
        evidence: ["src/lib/products/cybervault/viewer.ts:15-35", "src/lib/products/cybervault/viewer.ts:41-67"],
      },
      {
        q: "Who can see client-vault records?",
        a: "Managers see every scope, while other users can see only assigned client IDs and must also have the view permission.",
        evidence: ["docs/products.md:177-178", "src/lib/products/cybervault/viewer.ts:15-35", "src/lib/products/cybervault/viewer.ts:62-82"],
      },
      {
        q: "Can an employee have access to a client vault but not the company vault?",
        a: "Yes. A user's grant stores company access separately from the list of client IDs they can access.",
        evidence: ["src/lib/products/cybervault/access.ts:15-39", "src/lib/products/cybervault/viewer.ts:15-35"],
      },
      {
        q: "Can access be limited to selected clients?",
        a: "Yes. Access grants filter client IDs against valid clients before saving them, so the client list can be scoped per user.",
        evidence: ["src/lib/products/cybervault/access.ts:28-39"],
      },
      {
        q: "Does permission to view a vault automatically allow editing it?",
        a: "No. Writing requires scope access and the corresponding company- or client-management permission in addition to any view permission.",
        evidence: ["src/lib/products/cybervault/viewer.ts:62-73"],
      },
      {
        q: "Are vault lists filtered to the viewer's assigned scopes?",
        a: "Yes. The data layer applies a scope filter to record queries; a user without view permission receives a filter that matches no records.",
        evidence: ["src/lib/products/cybervault/viewer.ts:75-82", "src/lib/products/cybervault/records.ts:247-288"],
      },
      {
        q: "Are stored passwords encrypted?",
        a: "CyberVault encrypts stored credential secrets with app-level AES-256-GCM using the configured DLMS encryption key. This describes the application code, not a broader compliance certification.",
        evidence: ["docs/products.md:173-175", "src/lib/products/cybervault/crypto.ts:4-17", "src/lib/products/cybervault/crypto.ts:36-68"],
      },
      {
        q: "What configuration is required to encrypt passwords?",
        a: "The encryption key must be set as a base64-encoded 32-byte PLATFORM_ENCRYPTION_KEY; encryption fails when the key is missing or malformed.",
        evidence: ["src/lib/products/cybervault/crypto.ts:26-42", "src/lib/products/cybervault/records.ts:452-473"],
      },
      {
        q: "Are saved passwords displayed in record lists?",
        a: "No. Credential list rows contain a has-password indicator and password-updated timestamp, not the plaintext secret.",
        evidence: ["src/lib/products/cybervault/records.ts:157-172", "src/lib/products/cybervault/records.ts:324-329"],
      },
      {
        q: "How does a permitted user reveal a credential password?",
        a: "A dedicated reveal operation checks access and records a reveal/copy audit event; the decrypted value is returned only through that path.",
        evidence: ["docs/products.md:173-175", "src/lib/products/cybervault/records.ts:516-546", "src/lib/products/cybervault/crypto.ts:12-17"],
      },
      {
        q: "Do password reveals appear in application logs or notifications?",
        a: "The crypto module documents that plaintext is not logged or sent in a list; the repository also defines reveal audit events separately from vault notifications.",
        evidence: ["src/lib/products/cybervault/crypto.ts:12-17", "src/lib/products/cybervault/audit.ts:18-35", "src/lib/products/cybervault/notifications.ts:1-51"],
      },
      {
        q: "Can a revealed password remain visible indefinitely?",
        a: "No. The client-safe vault constants specify that a revealed secret stays on screen for 30 seconds before it re-masks.",
        evidence: ["src/lib/products/cybervault/constants.ts:92-104", "src/lib/products/cybervault/records.ts:516-546"],
      },
      {
        q: "Can I change the encryption key without a migration?",
        a: "No. The crypto module documents a rotation process: keep the old key, decrypt stored credential secrets, re-encrypt them with the new key, then swap the configured key.",
        evidence: ["src/lib/products/cybervault/crypto.ts:14-18"],
      },
      {
        q: "Can records be archived instead of deleted?",
        a: "Yes. Records have Active and Archived statuses, and the record status operation can change between those states.",
        evidence: ["src/lib/products/cybervault/constants.ts:18-20", "src/lib/products/cybervault/records.ts:670-679"],
      },
      {
        q: "What happens when a record is deleted?",
        a: "CyberVault uses a deleted-at field for soft deletion, so normal record queries omit deleted records rather than removing them from the data model immediately.",
        evidence: ["src/lib/products/cybervault/db.ts:11-41", "src/lib/products/cybervault/records.ts:247-254", "src/lib/products/cybervault/records.ts:680-691"],
      },
      {
        q: "Can any vault record have an expiry date?",
        a: "The shared record shape includes an expiry date, and the expiry logic can classify records as having no date, valid, expiring or expired.",
        evidence: ["src/lib/products/cybervault/records.ts:47-56", "src/lib/products/cybervault/records.ts:128-140", "src/lib/products/cybervault/constants.ts:85-92"],
      },
      {
        q: "How does CyberVault decide whether something is expiring soon?",
        a: "It compares the expiry date to today and the configured warning window; the default warning window is 30 days.",
        evidence: ["src/lib/products/cybervault/records.ts:128-140", "src/lib/products/cybervault/constants.ts:92-104", "src/lib/products/cybervault/settings.ts:8-25"],
      },
      {
        q: "Can an administrator change the expiry-warning window?",
        a: "Yes. Vault settings let an administrator save the warning-day value and whether alerts are enabled.",
        evidence: ["src/lib/products/cybervault/settings.ts:8-33", "src/app/(products)/cybervault/(protected)/settings/page.tsx:1-80"],
      },
      {
        q: "Can the vault notify managers about upcoming expirations?",
        a: "Yes. The daily expiry sweep checks the settings and can notify the vault's managers about expired and expiring records.",
        evidence: ["src/lib/products/cybervault/alerts.ts:1-69", "src/lib/products/cybervault/settings.ts:8-33", "src/app/(products)/api/cybervault/cron/route.ts:1-14"],
      },
      {
        q: "Can I review all expired and soon-to-expire records in one place?",
        a: "Yes. CyberVault has an Expiry & Alerts screen with separate expired, expiring-soon and later groups.",
        evidence: ["src/lib/products/cybervault/overview.ts:80-96", "src/app/(products)/cybervault/(protected)/expiry/page.tsx:1-59"],
      },
      {
        q: "Can I filter records by scope, client, category, status or expiry?",
        a: "Yes. Record queries support filters for company/client scope, client ID, category, active/archived status and expiry state.",
        evidence: ["src/lib/products/cybervault/records.ts:228-288", "src/lib/products/cybervault/page.ts:7-33"],
      },
      {
        q: "What fields does vault search look through?",
        a: "Search is record-type-specific: credentials use name, username, login URL and notes; documents use name, description, notes and version filenames; URL/account records use name, URL, account and notes; notes use name and body.",
        evidence: ["src/lib/products/cybervault/records.ts:236-244", "src/lib/products/cybervault/records.ts:247-288"],
      },
      {
        q: "Can I sort vault records by expiry date?",
        a: "Yes. Queries can sort by expiry, created date, updated date or name.",
        evidence: ["src/lib/products/cybervault/records.ts:270-279", "src/lib/products/cybervault/records.ts:228-245"],
      },
      {
        q: "Does the dashboard show recent vault activity?",
        a: "Yes. The dashboard includes recent activity and recently added or updated records; activity visibility follows the viewer's permissions.",
        evidence: ["src/lib/products/cybervault/overview.ts:37-79", "src/app/(products)/cybervault/(protected)/page.tsx:1-100"],
      },
      {
        q: "Can vault activity be audited?",
        a: "Yes. The audit model includes credential, document, link, note, access, settings and export entities, with operations to list recent activity.",
        evidence: ["src/lib/products/cybervault/audit.ts:15-35", "src/lib/products/cybervault/audit.ts:83-117", "src/lib/products/cybervault/audit.ts:149-197"],
      },
      {
        q: "Can a user inspect the audit trail for one client?",
        a: "Audit queries accept client and scope filters, so permitted activity can be reviewed in the context of a client or company vault.",
        evidence: ["src/lib/products/cybervault/audit.ts:149-197", "src/lib/products/cybervault/overview.ts:37-79"],
      },
      {
        q: "Which file formats can be uploaded to CyberVault?",
        a: "The client-side allow-list includes common image, PDF, Office, CSV, text and ZIP extensions; the server also checks the content against the extension's expected file signature.",
        evidence: ["src/lib/products/cybervault/file-types.ts:1-3", "src/lib/products/cybervault/files.ts:18-56", "src/lib/products/cybervault/files.ts:70-81"],
      },
      {
        q: "What is the maximum CyberVault file size?",
        a: "The configured upload limit is 4 MiB. Empty files, oversized files, unsupported extensions and content that does not match its extension are rejected.",
        evidence: ["src/lib/products/cybervault/constants.ts:92-104", "src/lib/products/cybervault/files.ts:70-81"],
      },
      {
        q: "Are uploaded vault files publicly accessible?",
        a: "Files are stored by a server-side operation and read through a vault-controlled path; document APIs require the signed-in viewer and access checks rather than exposing a public file URL.",
        evidence: ["src/lib/products/cybervault/files.ts:1-17", "src/lib/products/cybervault/files.ts:57-84", "src/app/(products)/api/cybervault/files/[id]/route.ts:1-62"],
      },
      {
        q: "Can administrators see who has vault access?",
        a: "Yes. Vault access settings list user grants, including company access and client selections, for access administration.",
        evidence: ["src/lib/products/cybervault/access.ts:40-84", "src/app/(products)/cybervault/(protected)/settings/page.tsx:1-80"],
      },
      {
        q: "Can the vault tell me whether password encryption is configured?",
        a: "Yes. CyberVault has an encryption-configuration check used to determine whether the DLMS key is available and valid.",
        evidence: ["src/lib/products/cybervault/crypto.ts:26-42", "src/app/(products)/cybervault/(protected)/settings/page.tsx:1-80"],
      },
      {
        q: "Does a client need a second profile inside CyberVault?",
        a: "No. CyberVault uses the existing client record and stores client-vault records against that client reference.",
        evidence: ["docs/products.md:173-178", "src/lib/products/cybervault/access.ts:93-110", "src/lib/products/cybervault/records.ts:47-56"],
      },
      {
        q: "Can I see totals for company and client vault records?",
        a: "Yes. The dashboard tracks company and client totals along with counts for credentials, documents, links and notes, subject to its filters.",
        evidence: ["src/lib/products/cybervault/overview.ts:26-79", "src/app/(products)/cybervault/(protected)/page.tsx:1-100"],
      },
      {
        q: "Can CyberVault send notifications for access changes or record events?",
        a: "The notification service supports expiry, access and record-added, revealed, deleted or archived event types; actual notifications depend on the relevant product action.",
        evidence: ["src/lib/products/cybervault/notifications.ts:1-51", "src/lib/products/cybervault/access.ts:28-39", "src/lib/products/cybervault/records.ts:516-546"],
      },
      {
        q: "How many records can one vault list request return?",
        a: "Record queries are capped by the configured page size of 200 results.",
        evidence: ["src/lib/products/cybervault/constants.ts:92-104", "src/lib/products/cybervault/records.ts:270-288"],
      },
      {
        q: "Does CyberVault share its encryption key with other product modules?",
        a: "The CyberVault crypto helper is deliberately separate from the other modules' helpers; rotating this module's key is documented as not affecting their key material.",
        evidence: ["src/lib/products/cybervault/crypto.ts:4-18"],
      },
    ],
  },
];
