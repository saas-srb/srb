import type { CandidateRef, AttemptStatus, SubmitReason, SecurityEventType } from "@/lib/products/evaliq/constants";
import type { PublicDefinition, QuestionDefinition, QuestionResponse, QuestionType } from "@/lib/products/evaliq/question-types";
import type { QuestionMedia } from "@/lib/products/evaliq/questions";
import type { TestConfig } from "@/lib/products/evaliq/tests";

/** Shapes of `ots_attempts` documents. Split out so the engine and evaluation modules can share them without an import cycle. */

export interface Outcome {
  status: "correct" | "incorrect" | "partial" | "unanswered" | "pending";
  /** null while pending manual evaluation. */
  awarded: number | null;
  auto: boolean;
  evaluatedBy: string | null;
  evaluatedAt: Date | null;
  comment: string;
  /** Set when a human changed an auto-graded mark. */
  overridden: boolean;
}

/** One question as frozen into this attempt — later edits to the bank never change it. */
export interface PaperItem {
  qid: string;
  code: string;
  section: number;
  type: QuestionType;
  prompt: string;
  media: QuestionMedia | null;
  difficulty: string;
  subject: string;
  topic: string;
  categoryId: string | null;
  explanation: string;
  /** Includes the answer key — NEVER sent to the candidate. */
  definition: QuestionDefinition;
  /** The candidate's view (answer key stripped, options already shuffled for this attempt). */
  view: PublicDefinition;
  marks: number;
  negativeMarks: number;
  autoGradable: boolean;
  outcome: Outcome | null;
}

export interface Answer {
  response: QuestionResponse | null;
  flagged: boolean;
  visited: boolean;
  timeMs: number;
  savedAt: Date | null;
}

export interface SectionState {
  title: string;
  timeLimitSec: number | null;
  startedAt: Date | null;
  deadlineAt: Date | null;
  locked: boolean;
}

export interface SecurityEvent {
  type: SecurityEventType;
  at: Date;
  detail: string;
}

export interface SectionResult {
  index: number;
  title: string;
  total: number;
  obtained: number;
  percentage: number;
  questions: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  pending: number;
}

export interface AttemptResult {
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  pending: number;
  totalMarks: number;
  /** Positive marks earned. */
  marksObtained: number;
  /** Negative marks deducted (≤ 0). */
  negativeMarks: number;
  /** max(0, obtained + negative). */
  finalScore: number;
  percentage: number;
  passed: boolean;
  /** true while subjective answers still await evaluation — score is provisional. */
  provisional: boolean;
  timeTakenSec: number;
  sections: SectionResult[];
}

export interface Attempt {
  _id: string;
  assignmentId: string;
  testId: string;
  candidate: CandidateRef;
  candidateKey: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: Date;
  /** Hard deadline (server-enforced) — null for untimed / advisory-timer tests. */
  deadlineAt: Date | null;
  /** Advisory end for tests whose timer does not auto-submit. */
  softDeadlineAt: Date | null;
  submittedAt: Date | null;
  submitReason: SubmitReason | null;
  /** Current window/device token (single-session enforcement). */
  sessionId: string;
  seed: number;
  /** Config frozen at start: the rules this attempt is taken and marked under. */
  config: TestConfig;
  testName: string;
  sectionMode: "free" | "sequential";
  sections: SectionState[];
  currentSection: number;
  /** Furthest question index reached (forward-only navigation). */
  cursor: number;
  paper: PaperItem[];
  answers: Answer[];
  events: SecurityEvent[];
  violations: number;
  client: { startIp: string | null; startUserAgent: string | null; lastIp: string | null; channel: "staff" | "portal" };
  result: AttemptResult | null;
  evaluatedAt: Date | null;
  resultPublishedAt: Date | null;
  /** Actor that took the attempt (`admin_users` id, or `portal:<external_users id>`). */
  takenBy: string;
  createdAt: Date;
  updatedAt: Date;
}
