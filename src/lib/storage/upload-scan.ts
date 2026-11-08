import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { getDb } from "@/lib/mongodb";
import { getConfig } from "@/lib/platform/config/store";

/**
 * The safety check every upload passes before it is stored (called from `putObject`, which every product's file storage goes through).
 *
 * What it does, with no outside service: refuses programs and scripts (by file name AND by what the bytes really are, so a renamed .exe is
 * still caught), documents with macros (Word, Excel, PowerPoint — old and new formats), PDFs that launch programs, HTML and SVG that carry
 * script, archives that hold any of those or are built to blow up when opened, and the standard EICAR antivirus test file.
 *
 * What it can add: when a VirusTotal key is saved (Platform Console → Integrations), the file's SHA-256 is looked up at VirusTotal (only the hash is sent, never the file)
 * and a file that several engines already know as malware is refused. A lookup that fails or times out lets the upload through.
 *
 * What it is not: an antivirus engine that reads every byte for unknown malware. Files are stored privately and only delivered through
 * signed-in, permission-checked routes, as downloads with a fixed content type, which is the second line of defence.
 */

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const BLOCKED_EXT = new Set([
  "exe", "dll", "msi", "msp", "bat", "cmd", "com", "scr", "pif", "cpl", "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1", "jar", "sh", "reg", "lnk", "hta", "gadget",
  "html", "htm", "xhtml", "shtml", "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppam", "sldm",
]);
const OOXML_EXT = new Set(["docx", "dotx", "xlsx", "xltx", "pptx", "potx", "xlsb"]);
const ZIP_MAX_SCAN = 60 * 1024 * 1024; // deeper archive checks run up to this size
const ZIP_MAX_ENTRIES = 10_000;
const ZIP_MAX_UNPACKED = 2 * 1024 ** 3;
const VT_SKIP = /^(image|audio|video|text)\//;

export type ScanResult = { ok: true } | { ok: false; reason: string };

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const latin1 = (b: Uint8Array, from = 0, to?: number) => Buffer.from(b.buffer, b.byteOffset + from, (to ?? b.length) - from).toString("latin1");

/** Programs by their bytes: Windows PE, Linux ELF, macOS Mach-O, Java classes, and scripts that start with a shebang. */
function isProgram(b: Uint8Array): boolean {
  if (b.length < 4) return false;
  if (starts(b, [0x4d, 0x5a]) && b.length > 0x40) {
    const pe = b[0x3c] | (b[0x3d] << 8) | (b[0x3e] << 16) | (b[0x3f] << 24);
    if (pe > 0 && pe + 4 <= b.length && starts(b, [0x50, 0x45, 0x00, 0x00], pe)) return true;
  }
  if (starts(b, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF
  if (starts(b, [0xcf, 0xfa, 0xed, 0xfe]) || starts(b, [0xce, 0xfa, 0xed, 0xfe]) || starts(b, [0xfe, 0xed, 0xfa, 0xce]) || starts(b, [0xfe, 0xed, 0xfa, 0xcf])) return true; // Mach-O
  if (starts(b, [0xca, 0xfe, 0xba, 0xbe])) return true; // Java class / universal binary
  if (starts(b, [0x23, 0x21])) return true; // #!
  return false;
}

const isZip = (b: Uint8Array) => starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06]);
const isOle = (b: Uint8Array) => starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

async function scanZip(name: string, body: Buffer): Promise<string | null> {
  if (body.length > ZIP_MAX_SCAN) return null;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(body);
  } catch {
    return null; // not a readable zip: its own product's type check decides
  }
  const entries = Object.values(zip.files);
  if (entries.length > ZIP_MAX_ENTRIES) return `${name} holds too many files (${entries.length.toLocaleString("en-IN")}).`;
  let unpacked = 0;
  for (const e of entries) {
    unpacked += (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    const lower = e.name.toLowerCase();
    if (/(^|\/)vbaproject\.bin$/.test(lower) || /(^|\/)activex\//.test(lower)) return `${name} contains macros or ActiveX controls.`;
    if (!e.dir && BLOCKED_EXT.has(ext(lower))) return `${name} contains a program or script (${e.name.split("/").pop()}).`;
  }
  if (unpacked > ZIP_MAX_UNPACKED) return `${name} would unpack to an unreasonable size.`;
  return null;
}

/** The built-in checks. Pure apart from reading archives; never throws. */
export async function scanUploadBuiltIn(input: { filename: string; contentType?: string | null; body: Buffer }): Promise<ScanResult> {
  const { filename, body } = input;
  // Storage keys are server-made names (a random id plus the extension), so the person's own file name is not known here: say "This file".
  const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/i;
  const name = !filename || UUID_KEY.test(filename) ? "This file" : `“${filename}”`;
  const lowerName = (filename || "").toLowerCase();
  const parts = lowerName.split(".").slice(1);
  const bad = (reason: string): ScanResult => ({ ok: false, reason });
  try {
    if (parts.some((p, i) => BLOCKED_EXT.has(p) && (i === parts.length - 1 || /^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png|gif|csv|zip)$/.test(parts[i + 1] ?? "")))) {
      return bad(`${name} can't be uploaded: programs, scripts, web pages and macro-enabled documents aren't allowed.`);
    }
    if (isProgram(body)) return bad(`${name} is a program, not a document, so it can't be uploaded.`);
    if (body.length < 1_000_000 && latin1(body).includes(EICAR)) return bad(`${name} is the standard antivirus test file (EICAR).`);

    if (isZip(body)) {
      const z = await scanZip(name, body);
      if (z) return bad(z);
    }
    if (isOle(body)) {
      // Old Word / Excel / PowerPoint formats keep macros in a storage called VBA (stored as UTF-16 names).
      const text = latin1(body, 0, Math.min(body.length, 8 * 1024 * 1024));
      if (text.includes("_VBA_PROJECT") || text.includes("_\u0000V\u0000B\u0000A\u0000_\u0000P\u0000R\u0000O\u0000J\u0000E\u0000C\u0000T") || /V\u0000B\u0000A\u0000_\u0000P\u0000R\u0000O\u0000J/.test(text)) return bad(`${name} contains macros.`);
    }
    if (starts(body, [0x25, 0x50, 0x44, 0x46])) {
      const text = latin1(body, 0, Math.min(body.length, 20 * 1024 * 1024));
      if (/\/Launch\b/.test(text)) return bad(`${name} is a PDF that tries to launch a program.`);
    }
    const head = latin1(body, 0, Math.min(body.length, 512 * 1024)).toLowerCase();
    const looksSvg = ext(lowerName) === "svg" || /^\s*(<\?xml[^>]*>\s*)?(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(head);
    if (looksSvg && /<script|javascript:|\bon[a-z]+\s*=|<foreignobject|<iframe|<embed/.test(head)) return bad(`${name} is an image that carries script, so it can't be uploaded.`);
    if (/^\s*(<!doctype html|<html[\s>])/.test(head)) return bad(`${name} is a web page; upload it as a PDF or a document instead.`);
    if (OOXML_EXT.has(ext(lowerName)) && !isZip(body)) return bad(`${name} isn't a valid ${ext(lowerName).toUpperCase()} file.`);
  } catch (err) {
    console.error("[upload-scan] built-in check failed", err instanceof Error ? err.message : err);
  }
  return { ok: true };
}

/** Optional: a file that several VirusTotal engines already know as malware (hash lookup only). */
async function knownMalware(contentType: string, body: Buffer): Promise<boolean> {
  const key = await getConfig("VIRUSTOTAL_API_KEY");
  if (!key || VT_SKIP.test(contentType) || body.length > 650 * 1024 * 1024) return false;
  try {
    const sha = createHash("sha256").update(body).digest("hex");
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha}`, { headers: { "x-apikey": key }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return false; // 404 = unknown to VirusTotal, which is the normal case
    const stats = ((await res.json()) as { data?: { attributes?: { last_analysis_stats?: { malicious?: number } } } }).data?.attributes?.last_analysis_stats;
    return (stats?.malicious ?? 0) >= 3;
  } catch {
    return false;
  }
}

export async function scanUpload(input: { filename: string; contentType?: string | null; body: Buffer; folder?: string }): Promise<ScanResult> {
  const built = await scanUploadBuiltIn(input);
  if (!built.ok) return built;
  if (await knownMalware(input.contentType ?? "application/octet-stream", input.body)) return { ok: false, reason: "This file is known malware, so it can't be uploaded." };
  return built;
}

export const BLOCKED_UPLOADS = "upload_blocks";
export interface BlockedUpload { at: Date; filename: string; reason: string; size: number; folder: string }

/** Keeps a short record of what was refused so a Director can see it (kept 180 days). Never throws. */
export async function recordBlockedUpload(row: Omit<BlockedUpload, "at">): Promise<void> {
  try {
    const col = (await getDb()).collection<BlockedUpload>(BLOCKED_UPLOADS);
    await col.createIndex({ at: 1 }, { expireAfterSeconds: 180 * 86400 }).catch(() => {});
    await col.insertOne({ ...row, filename: row.filename.slice(0, 200), at: new Date() });
  } catch (err) {
    console.error("[upload-scan] could not record a blocked upload", err instanceof Error ? err.message : err);
  }
}

export async function recentBlockedUploads(limit = 10): Promise<BlockedUpload[]> {
  return (await getDb()).collection<BlockedUpload>(BLOCKED_UPLOADS).find({}).sort({ at: -1 }).limit(limit).toArray();
}
