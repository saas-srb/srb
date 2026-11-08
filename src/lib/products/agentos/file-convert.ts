import "server-only";
import ExcelJS from "exceljs";

/**
 * Format helpers for uploads. Nothing here embeds, chunks or indexes — that is
 * OpenAI's job. These only (a) check a file's bytes match its extension and
 * (b) turn spreadsheets, which OpenAI file_search can't index, into Markdown text.
 */

export function fileExtension(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(ext) && name.includes(".") ? ext : "";
}

const startsWith = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];

/** Text formats must not contain NUL bytes in their first 8 KB. */
function looksLikeText(buf: Buffer): boolean {
  return !buf.subarray(0, 8192).includes(0);
}

export function sniffMatches(extension: string, buf: Buffer): boolean {
  switch (extension) {
    case "pdf":
      return buf.subarray(0, 1024).includes(Buffer.from("%PDF"));
    case "docx":
    case "xlsx":
    case "pptx":
      return startsWith(buf, ZIP);
    case "doc":
      return startsWith(buf, OLE);
    case "png":
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47]);
    case "jpg":
    case "jpeg":
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(buf, [0x47, 0x49, 0x46, 0x38]);
    case "webp":
      return startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return looksLikeText(buf);
  }
}

const MAX_ROWS_PER_SHEET = 20000;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("");
    if ("error" in value) return "";
  }
  return String(value);
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV → Markdown doc wrapping the raw CSV; XLSX → one CSV section per sheet. */
export async function spreadsheetToText(extension: string, buf: Buffer, filename: string): Promise<string> {
  if (extension === "csv") {
    return `# ${filename}\n\nTabular data (CSV, first row is the header):\n\n\`\`\`csv\n${buf.toString("utf-8").replace(/^﻿/, "")}\n\`\`\`\n`;
  }
  const wb = new ExcelJS.Workbook();
  // exceljs' types predate Node's generic Buffer.
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const parts: string[] = [`# ${filename}`];
  wb.eachSheet((sheet) => {
    const lines: string[] = [];
    let n = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (n++ >= MAX_ROWS_PER_SHEET) return;
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map((v) => csvCell(cellText(v).trim()));
      if (values.some(Boolean)) lines.push(values.join(","));
    });
    if (lines.length) parts.push(`## Sheet: ${sheet.name}\n\nFirst row is the header:\n\n\`\`\`csv\n${lines.join("\n")}\n\`\`\``);
  });
  return parts.length > 1 ? parts.join("\n\n") + "\n" : "";
}
