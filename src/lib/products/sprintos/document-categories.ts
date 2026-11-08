/**
 * Client-safe PMS document categories. NEVER import `server-only` here.
 */

export const PMS_DOCUMENT_CATEGORIES = [
  { value: "srs", label: "SRS / Requirements" },
  { value: "proposal", label: "Proposal" },
  { value: "contract", label: "Contract / SOW" },
  { value: "design", label: "Design Files" },
  { value: "api_docs", label: "API Docs" },
  { value: "testing", label: "Testing Reports" },
  { value: "deployment", label: "Deployment Docs" },
  { value: "other", label: "Other" },
] as const;

export type PmsDocumentCategory = (typeof PMS_DOCUMENT_CATEGORIES)[number]["value"];

export const DEFAULT_DOCUMENT_CATEGORY: PmsDocumentCategory = "other";

export function isValidDocumentCategory(value: unknown): value is PmsDocumentCategory {
  return typeof value === "string" && PMS_DOCUMENT_CATEGORIES.some((c) => c.value === value);
}

export function getDocumentCategoryLabel(value: string | undefined): string {
  return PMS_DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "zip", "fig", "sketch", "json", "yaml", "yml",
]);

/** Pure file guard used by the upload route. Returns an error string or null. */
export function validateDocumentFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File is larger than 25 MB.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) return "That file type isn’t allowed.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
