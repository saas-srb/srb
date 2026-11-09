/** Client-safe shapes of the "Edit with AI" conversation, shared by ContractFlow and Playbook. */
export interface ChatChange { kind: string; before: string | null; after: string | null; /** The block that changed, so the editor can scroll to it and highlight it. */ blockId?: string }
/** A message of the conversation as the screen shows it. */
export interface ChatTurn { id: string; role: "user" | "assistant"; text: string; at: string; versionNumber: number | null; previousVersionNumber: number | null; changes: ChatChange[] | null; undone: boolean; attachments?: { name: string; size: number }[]; steps?: string[]; suggestions?: SuggestionCard[] }
/** What the chat component needs from a host product. Every call is a server action. */
export interface AiEditApi {
  load(): Promise<{ ok: true; turns: ChatTurn[]; canEdit: boolean; reason: string | null } | { ok: false; message: string }>;
  /** `form` holds `message` and up to five `files`. */
  send(form: FormData): Promise<{ ok: true; user: ChatTurn; reply: ChatTurn } | { ok: false; message: string }>;
  undo(turnId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Optional modes. A host that leaves them out hides the mode. */
  ask?(form: FormData): Promise<{ ok: true; answer: string; references: { blockId: string; quote: string }[] } | { ok: false; message: string }>;
  review?(): Promise<{ ok: true; issues: ReviewIssue[] } | { ok: false; message: string }>;
  applyIssue?(issue: { blockId: string | null; replacement: string }): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Accept some or all suggested operations of a turn; `reject` closes the turn without applying. */
  accept?(turnId: string, indexes: number[]): Promise<{ ok: true; reply: ChatTurn } | { ok: false; message: string }>;
  reject?(turnId: string): Promise<{ ok: true } | { ok: false; message: string }>;
}

/** A suggested change the person can accept or reject on its own (Edit mode "as suggestions"). */
export interface SuggestionCard { index: number; op: "replace" | "insert" | "delete"; blockId: string | null; before: string | null; after: string | null; skipped: string | null; state: "pending" | "accepted" | "rejected" }
export interface ReviewIssue { id: string; blockId: string | null; category: "grammar" | "clarity" | "terminology" | "missing_section" | "placeholder" | "legal_risk"; message: string; replacement: string }
export const TEXT_ACTIONS = ["rewrite", "shorten", "expand", "simplify", "formal", "friendly", "fix", "bullets", "summarise", "custom", "write"] as const;
export type TextAction = (typeof TEXT_ACTIONS)[number];
export const TEXT_ACTION_LABEL: Record<TextAction, string> = { rewrite: "Rewrite", shorten: "Shorten", expand: "Expand", simplify: "Simplify", formal: "More formal", friendly: "More friendly", fix: "Fix grammar and spelling", bullets: "Make it bullets", summarise: "Summarise", custom: "Custom instruction…", write: "Help me write" };
/** The editor-side tools the host provides (server actions). Every call is checked on the server. */
export interface AiTextTools {
  transform(input: { action: TextAction; instruction?: string; selected: string }): Promise<{ ok: true; text: string } | { ok: false; message: string }>;
}
