/** Pure AI Bots vocabulary — safe to import from client components. */

export type Option = { value: string; label: string };

export const BOT_STATUSES = ["active", "inactive"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

/** Palette a bot's avatar can use (Tailwind classes resolved in `BotAvatar`). */
export const BOT_COLORS = ["indigo", "violet", "sky", "emerald", "amber", "rose", "slate", "teal"] as const;
export type BotColor = (typeof BOT_COLORS)[number];

/**
 * Icon keys a bot can pick (the lucide components are mapped in
 * `components/agentos/bot-icons.tsx`). This is a UI palette, not a bot list.
 */
export const BOT_ICONS = [
  "bot", "sparkles", "brain", "message", "file-text", "clipboard", "briefcase", "presentation",
  "phone", "calendar", "search", "lightbulb", "pen", "code", "chart", "shield",
  "users", "mail", "rocket", "graduation", "scale", "wallet", "building", "globe",
] as const;
export type BotIcon = (typeof BOT_ICONS)[number];

/** Suggested categories — free text is allowed too. */
export const BOT_CATEGORY_SUGGESTIONS = ["Sales", "Pre-sales", "Delivery", "Business Analysis", "HR", "Finance", "Marketing", "Engineering", "Support", "General"];

/** Suggested knowledge-file categories — free text is allowed too. */
export const FILE_CATEGORY_SUGGESTIONS = ["Company Profile", "Services", "Case Studies", "Previous Work", "Templates", "Guidelines", "Pricing", "Policies", "Reference", "Other"];

export const FILE_STATUSES = ["processing", "ready", "failed", "disabled"] as const;
export type KbFileStatus = (typeof FILE_STATUSES)[number];
export const FILE_STATUS_LABEL: Record<KbFileStatus, string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  disabled: "Disabled",
};

/**
 * Knowledge-base formats. OpenAI file_search indexes the "native" ones as-is;
 * CSV and Excel are not file_search formats, so the server converts them to
 * Markdown tables before uploading (still OpenAI-only — no other index).
 */
export const KB_NATIVE_EXTENSIONS = ["pdf", "doc", "docx", "txt", "md", "pptx", "html", "json", "tex"];
export const KB_CONVERTED_EXTENSIONS = ["csv", "xlsx"];
export const KB_EXTENSIONS = [...KB_NATIVE_EXTENSIONS, ...KB_CONVERTED_EXTENSIONS];

/** Chat attachments: PDFs go to the model as files, images as images, text-like files inline. */
export const ATTACHMENT_PDF_EXTENSIONS = ["pdf"];
export const ATTACHMENT_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
export const ATTACHMENT_TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "xlsx", "html"];
export const ATTACHMENT_EXTENSIONS = [...ATTACHMENT_PDF_EXTENSIONS, ...ATTACHMENT_IMAGE_EXTENSIONS, ...ATTACHMENT_TEXT_EXTENSIONS];

/**
 * Vercel caps a function request body at 4.5 MB, so every upload (knowledge
 * file or chat attachment) is capped just below it.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;

export const LIMITS = {
  nameMax: 80,
  descriptionMax: 500,
  instructionsMax: 20000,
  messageMax: 8000,
  chatTitleMax: 120,
  starterPromptsMax: 4,
  /** Characters of an inlined text attachment sent to the model. */
  inlineAttachmentChars: 60000,
};

export interface ModelPrice {
  /** OpenAI model id. */
  id: string;
  label: string;
  /** USD per 1M input tokens — an estimate the admin can edit in Settings. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Seed list for Settings; admins edit it (the live source of truth is `aibots_settings`). */
export const DEFAULT_MODELS: ModelPrice[] = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", input: 0.4, output: 1.6 },
  { id: "gpt-4.1", label: "GPT-4.1", input: 2, output: 8 },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", input: 0.1, output: 0.4 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", input: 0.15, output: 0.6 },
  { id: "gpt-4o", label: "GPT-4o", input: 2.5, output: 10 },
  { id: "o4-mini", label: "o4-mini (reasoning)", input: 1.1, output: 4.4 },
];

export const ATTACHMENT_MARKER = "[[yo-attachment:";

/** Reserved `botId` of "Start New Chat" — the general assistant, which is not a bot row (see `generalBot`). */
export const GENERAL_BOT_ID = "general";
export const GENERAL_BOT_NAME = "General Chat";
