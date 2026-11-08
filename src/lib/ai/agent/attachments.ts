import "server-only";
import type OpenAI from "openai";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { Attachment } from "@/lib/ai/agent/types";

/**
 * Turns what the person attached into something the model can read: images and PDFs go to the model as they are (it can see
 * them), spreadsheets and Word files become text, text-like files are passed through. Everything is size-capped.
 */

export const MAX_ATTACHMENTS = 5;
const MAX_TEXT = 40_000;
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const PDF_RE = /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/;
const DOC_RE = /^data:[\w.+/-]+;base64,([A-Za-z0-9+/=]+)$/;

type Part = OpenAI.Chat.ChatCompletionContentPart;

function bytesOf(dataUrl: string): number {
  return Math.floor((dataUrl.length * 3) / 4);
}

const clip = (t: string) => (t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}\n…[cut: the file is longer]` : t);
const safeName = (n: string) => n.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "file";

async function sheetText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const out: string[] = [];
  for (const ws of wb.worksheets.slice(0, 6)) {
    out.push(`# Sheet: ${ws.name}`);
    let rows = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows++ >= 300) return;
      const cells = (row.values as unknown[]).slice(1).map((c) => {
        if (c && typeof c === "object") return String((c as { text?: string; result?: unknown }).text ?? (c as { result?: unknown }).result ?? "");
        return c == null ? "" : String(c);
      });
      out.push(cells.join(" | "));
    });
    if (rows > 300) out.push(`…[${rows - 300} more rows not shown]`);
  }
  return out.join("\n");
}

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface PreparedAttachments {
  parts: Part[];
  /** One-line description of each, for the chat history. */
  notes: string[];
  errors: string[];
}

export async function prepareAttachments(list: Attachment[] | undefined): Promise<PreparedAttachments> {
  const parts: Part[] = [];
  const notes: string[] = [];
  const errors: string[] = [];
  let total = 0;
  for (const a of (list ?? []).slice(0, MAX_ATTACHMENTS)) {
    const name = safeName(a.name || "file");
    try {
      if (a.kind === "image") {
        if (!IMAGE_RE.test(a.data)) throw new Error("not a supported image (PNG, JPG, WEBP or GIF)");
        total += bytesOf(a.data);
        parts.push({ type: "image_url", image_url: { url: a.data, detail: "auto" } });
        notes.push(`image ${name}`);
      } else if (a.kind === "pdf") {
        if (!PDF_RE.test(a.data)) throw new Error("not a PDF");
        total += bytesOf(a.data);
        parts.push({ type: "file", file: { filename: name.endsWith(".pdf") ? name : `${name}.pdf`, file_data: a.data } } as Part);
        notes.push(`PDF ${name}`);
      } else if (a.kind === "doc") {
        const m = DOC_RE.exec(a.data);
        if (!m) throw new Error("unreadable file");
        total += bytesOf(a.data);
        const buf = Buffer.from(m[1], "base64");
        const lower = name.toLowerCase();
        const text = lower.endsWith(".xlsx") ? await sheetText(buf) : lower.endsWith(".docx") ? await docxText(buf) : "";
        if (!text) throw new Error("only .xlsx and .docx are supported (save older files in those formats)");
        parts.push({ type: "text", text: `[Attached file: ${name}]\n${clip(text)}` });
        notes.push(`file ${name}`);
      } else {
        parts.push({ type: "text", text: `[Attached file: ${name}]\n${clip(String(a.data))}` });
        notes.push(`file ${name}`);
      }
      if (total > MAX_BYTES) throw new Error("attachments are too large together (8 MB limit)");
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : "could not be read"}`);
    }
  }
  return { parts, notes, errors };
}
