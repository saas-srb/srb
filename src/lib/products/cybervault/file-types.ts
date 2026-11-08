/** Client-safe copy of the upload allow-list (the authoritative check runs server-side in `files.ts`). */
export const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "doc", "xls", "ppt", "docx", "xlsx", "pptx", "csv", "txt", "zip"];
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");
