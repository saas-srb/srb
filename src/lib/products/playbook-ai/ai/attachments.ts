import "server-only";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { putObject } from "@/lib/storage/blob";

/**
 * Attachments of the "Edit with AI" chat. Every file is checked by its CONTENT (magic bytes), never by its name or declared type, limited in
 * size and number, stored privately under a company-prefixed key, and prepared for the model: images and PDFs go to the model as vision /
 * file input, text, Markdown, CSV and Word files are turned into text. Nothing executable, no SVG, no scripts, no macro-enabled Office files.
 * Attachment content is reference material for the model, never instructions (a pinned rule in the registry prompt says so).
 */

export const ATTACH_LIMITS = { maxFiles: 5, maxImageOrPdfBytes: 10 * 1024 * 1024, maxOtherBytes: 5 * 1024 * 1024, maxTextChars: 40_000 } as const;
export type AttachKind = "image" | "pdf" | "docx" | "text";

export interface PreparedAttachment {
  name: string;
  size: number;
  mime: string;
  kind: AttachKind;
  storageKey: string;
  /** Extracted text for docx and text files. */
  text: string | null;
  /** Base64 data URL for images and PDFs, sent to the model. Never stored in the database. */
  dataUrl: string | null;
}

const starts = (b: Buffer, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString("latin1");
const safeName = (n: string) => n.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_").trim().slice(0, 120) || "file";

function sniff(b: Buffer): { kind: AttachKind; mime: string; ext: string } | "bad" {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: "png" };
  if (starts(b, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (ascii(b, 0, 5) === "%PDF-") return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  if (starts(b, [0x50, 0x4b, 0x03, 0x04])) return { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  // Executables and scripts are refused by their first bytes.
  if (starts(b, [0x4d, 0x5a]) || starts(b, [0x7f, 0x45, 0x4c, 0x46]) || starts(b, [0x23, 0x21]) || starts(b, [0xca, 0xfe, 0xba, 0xbe]) || starts(b, [0xcf, 0xfa, 0xed, 0xfe])) return "bad";
  if (b.includes(0)) return "bad";
  const head = b.subarray(0, 2000).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<script") || head.startsWith("<html") || head.startsWith("<!doctype")) return "bad";
  return { kind: "text", mime: "text/plain", ext: "txt" };
}

async function docxText(b: Buffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(b, { checkCRC32: false });
    const names = Object.keys(zip.files);
    if (names.some((n) => /vbaProject\.bin$/i.test(n))) return null; // macros: refused
    const f = zip.file("word/document.xml");
    if (!f) return null;
    const xml = await f.async("string");
    const text = xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return text.replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return null;
  }
}

export async function prepareAttachments(files: File[]): Promise<{ ok: true; items: PreparedAttachment[] } | { ok: false; message: string }> {
  if (files.length > ATTACH_LIMITS.maxFiles) return { ok: false, message: `Attach at most ${ATTACH_LIMITS.maxFiles} files to one message.` };
  const companyId = await currentCompanyId();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) return { ok: false, message: "Attachments are not available right now." };
  const items: PreparedAttachment[] = [];
  for (const file of files) {
    const name = safeName(file.name || "file");
    if (file.size === 0) return { ok: false, message: `${name} is empty.` };
    if (file.size > ATTACH_LIMITS.maxImageOrPdfBytes) return { ok: false, message: `${name} is too large (the limit is 10 MB for images and PDFs, 5 MB for other files).` };
    const buf = Buffer.from(await file.arrayBuffer());
    const k = sniff(buf);
    if (k === "bad") return { ok: false, message: `${name} is not an accepted file. Use PNG, JPEG, WebP, PDF, DOCX, TXT, MD or CSV.` };
    if ((k.kind === "docx" || k.kind === "text") && buf.length > ATTACH_LIMITS.maxOtherBytes) return { ok: false, message: `${name} is too large (the limit is 5 MB for this kind of file).` };
    let text: string | null = null;
    if (k.kind === "docx") {
      text = await docxText(buf);
      if (text === null) return { ok: false, message: `${name} could not be read as a Word document (macro-enabled files are not accepted).` };
    } else if (k.kind === "text") {
      text = buf.toString("utf8");
      if (text.includes("�") && (text.match(/�/g) ?? []).length > 3) return { ok: false, message: `${name} is not a text file.` };
    }
    const storageKey = (await putObject(`playbook-chat/${companyId}`, `${randomUUID()}.${k.ext}`, buf, k.mime)).storageKey;
    items.push({
      name, size: buf.length, mime: k.mime, kind: k.kind, storageKey,
      text: text === null ? null : text.slice(0, ATTACH_LIMITS.maxTextChars),
      dataUrl: k.kind === "image" || k.kind === "pdf" ? `data:${k.mime};base64,${buf.toString("base64")}` : null,
    });
  }
  return { ok: true, items };
}

/** What the chat history keeps of an attachment: name, size and where it is stored. Never the content. */
export const attachmentRecord = (a: PreparedAttachment) => ({ name: a.name, size: a.size, mime: a.mime, storageKey: a.storageKey });
