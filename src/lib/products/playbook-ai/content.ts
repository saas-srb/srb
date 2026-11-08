import {
  LIMITS,
  isSopModule,
  type ModuleLink,
  type RelatedPolicy,
  type SopBlock,
  type SopContent,
  type SopSection,
  type TextItem,
} from "@/lib/products/playbook-ai/constants";

/**
 * Validation / sanitisation of the SOP document body, plus the plain-text
 * projection and line diff used for version comparison. Pure functions (no
 * server-only imports). `validateContent` is the ONLY gate untrusted editor
 * JSON passes through before it is stored: every string is length-capped,
 * every URL is scheme-checked, every file reference must belong to the SOP.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function newBlockId(): string {
  return globalThis.crypto.randomUUID();
}

/** Strips control characters (keeps \n and \t) and caps length. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
}

/**
 * Allows http(s) and mailto links, and same-site paths ("/x" but never "//x").
 * Everything else (javascript:, data:, vbscript:, file:, …) is rejected.
 */
export function safeUrl(v: unknown, opts: { allowRelative?: boolean; httpsOnly?: boolean } = {}): string | null {
  if (typeof v !== "string") return null;
  const url = v.trim();
  if (!url || url.length > 2000 || /[\u0000-\u001F\u007F\s]/.test(url)) return null;
  if (url.startsWith("/")) return opts.allowRelative && !url.startsWith("//") && !url.includes("\\") ? url : null;
  try {
    const u = new URL(url);
    const ok = opts.httpsOnly ? ["https:"] : ["https:", "http:", "mailto:"];
    return ok.includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanId(v: unknown, seen: Set<string>): string {
  let id = typeof v === "string" && ID_RE.test(v) ? v : newBlockId();
  if (seen.has(id)) id = newBlockId();
  seen.add(id);
  return id;
}

function cleanList(v: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => cleanText(x, itemMax));
}

export type ContentResult = { ok: true; content: SopContent } | { ok: false; error: string };

export function emptyContent(title = ""): SopContent {
  return { title, description: "", purpose: "", scope: "", sections: [], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] };
}

function validateBlock(raw: unknown, seen: Set<string>, fileIds: ReadonlySet<string>): { block: SopBlock } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid content block." };
  const b = raw as Record<string, unknown>;
  const id = cleanId(b.id, seen);
  switch (b.type) {
    case "paragraph":
      return { block: { id, type: "paragraph", text: cleanText(b.text, LIMITS.richText) } };
    case "heading":
      return { block: { id, type: "heading", text: cleanText(b.text, LIMITS.title), level: b.level === 3 ? 3 : 2 } };
    case "steps":
      return { block: { id, type: "steps", items: cleanList(b.items, LIMITS.itemsPerList, 2000) } };
    case "bullets":
      return { block: { id, type: "bullets", items: cleanList(b.items, LIMITS.itemsPerList, 2000) } };
    case "table": {
      const header = cleanList(b.header, LIMITS.tableCols, LIMITS.cell);
      const cols = header.length;
      if (cols === 0) return { error: "A table needs at least one column." };
      const rows = Array.isArray(b.rows)
        ? b.rows.slice(0, LIMITS.tableRows).map((r) => {
            const cells = cleanList(r, cols, LIMITS.cell);
            while (cells.length < cols) cells.push("");
            return cells;
          })
        : [];
      return { block: { id, type: "table", header, rows } };
    }
    case "checklist": {
      const items: TextItem[] = [];
      const itemIds = new Set<string>();
      if (Array.isArray(b.items)) {
        for (const it of b.items.slice(0, LIMITS.itemsPerList)) {
          const o = (it ?? {}) as Record<string, unknown>;
          items.push({ id: cleanId(o.id, itemIds), text: cleanText(o.text, 1000) });
        }
      }
      return { block: { id, type: "checklist", title: cleanText(b.title, 200), items } };
    }
    case "image": {
      const fileId = typeof b.fileId === "string" ? b.fileId : "";
      if (fileId && !fileIds.has(fileId)) return { error: "An image refers to a file that is not attached to this SOP." };
      return { block: { id, type: "image", fileId, alt: cleanText(b.alt, 300), caption: cleanText(b.caption, 500) } };
    }
    case "video": {
      const fileId = typeof b.fileId === "string" && b.fileId ? b.fileId : null;
      if (fileId && !fileIds.has(fileId)) return { error: "A video refers to a file that is not attached to this SOP." };
      const rawUrl = typeof b.url === "string" && b.url.trim() ? b.url : null;
      const url = rawUrl ? safeUrl(rawUrl, { httpsOnly: true }) : null;
      if (rawUrl && !url) return { error: "Video links must be https:// URLs." };
      return { block: { id, type: "video", fileId, url, caption: cleanText(b.caption, 500) } };
    }
    case "attachment": {
      const fileId = typeof b.fileId === "string" ? b.fileId : "";
      if (fileId && !fileIds.has(fileId)) return { error: "An attachment refers to a file that is not attached to this SOP." };
      return { block: { id, type: "attachment", fileId, label: cleanText(b.label, 200) } };
    }
    case "link": {
      const rawUrl = typeof b.url === "string" ? b.url : "";
      const url = rawUrl.trim() ? safeUrl(rawUrl, { allowRelative: true }) : "";
      if (rawUrl.trim() && !url) return { error: `"${cleanText(rawUrl, 60)}" is not a valid link (use https://, mailto: or a /path).` };
      return { block: { id, type: "link", url: url ?? "", label: cleanText(b.label, 200), description: cleanText(b.description, 500) } };
    }
    case "note":
    case "warning":
    case "example":
    case "reference":
      return { block: { id, type: b.type, text: cleanText(b.text, LIMITS.richText) } };
    default:
      return { error: "Unknown content block type." };
  }
}

/**
 * @param fileIds ids of `sop_files` rows belonging to this SOP — a block may
 *   only reference those, so one SOP can never embed another SOP's files.
 */
export function validateContent(raw: unknown, fileIds: ReadonlySet<string>): ContentResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid SOP content." };
  const r = raw as Record<string, unknown>;

  const title = cleanText(r.title, LIMITS.title).trim();
  if (!title) return { ok: false, error: "Title is required." };

  const sectionsRaw = Array.isArray(r.sections) ? r.sections : [];
  if (sectionsRaw.length > LIMITS.sections) return { ok: false, error: `An SOP can have at most ${LIMITS.sections} sections.` };

  const seen = new Set<string>();
  const sections: SopSection[] = [];
  for (const s of sectionsRaw) {
    const o = (s ?? {}) as Record<string, unknown>;
    const blocksRaw = Array.isArray(o.blocks) ? o.blocks : [];
    if (blocksRaw.length > LIMITS.blocksPerSection) return { ok: false, error: `A section can have at most ${LIMITS.blocksPerSection} blocks.` };
    const blocks: SopBlock[] = [];
    for (const b of blocksRaw) {
      const res = validateBlock(b, seen, fileIds);
      if ("error" in res) return { ok: false, error: res.error };
      blocks.push(res.block);
    }
    const id = cleanId(o.id, seen);
    const sectionTitle = cleanText(o.title, 120).trim();
    if (!sectionTitle) return { ok: false, error: "Every section needs a title." };
    const key = typeof o.key === "string" && /^[a-z0-9_]{1,40}$/.test(o.key) ? o.key : id;
    sections.push({ id, key, title: sectionTitle, blocks });
  }

  const relatedSopIds = Array.isArray(r.relatedSopIds)
    ? Array.from(new Set(r.relatedSopIds.filter((x): x is string => typeof x === "string" && ID_RE.test(x)))).slice(0, LIMITS.relatedSops)
    : [];

  const relatedPolicies: RelatedPolicy[] = [];
  if (Array.isArray(r.relatedPolicies)) {
    for (const p of r.relatedPolicies.slice(0, LIMITS.relatedPolicies)) {
      const o = (p ?? {}) as Record<string, unknown>;
      const ptitle = cleanText(o.title, 200).trim();
      if (!ptitle) continue;
      const rawUrl = typeof o.url === "string" ? o.url.trim() : "";
      const url = rawUrl ? safeUrl(rawUrl, { allowRelative: true }) : "";
      if (rawUrl && !url) return { ok: false, error: `Policy link for "${ptitle}" is not a valid URL.` };
      relatedPolicies.push({ title: ptitle, url: url ?? "" });
    }
  }

  const moduleLinks: ModuleLink[] = [];
  if (Array.isArray(r.moduleLinks)) {
    for (const m of r.moduleLinks.slice(0, LIMITS.moduleLinks)) {
      const o = (m ?? {}) as Record<string, unknown>;
      if (!isSopModule(o.module)) continue;
      const url = safeUrl(o.url, { allowRelative: true });
      if (!url) return { ok: false, error: "Module links must be https:// URLs or /paths." };
      moduleLinks.push({ module: o.module, label: cleanText(o.label, 120).trim() || url, url });
    }
  }

  return {
    ok: true,
    content: {
      title,
      description: cleanText(r.description, LIMITS.description),
      purpose: cleanText(r.purpose, LIMITS.richText),
      scope: cleanText(r.scope, LIMITS.richText),
      sections,
      relatedSopIds,
      relatedPolicies,
      moduleLinks,
    },
  };
}

/** Every checklist item id in a document — used to compute progress. */
export function checklistItemIds(content: Pick<SopContent, "sections">): string[] {
  const ids: string[] = [];
  for (const s of content.sections) for (const b of s.blocks) if (b.type === "checklist") for (const i of b.items) ids.push(`${b.id}:${i.id}`);
  return ids;
}

/** File ids referenced by a document. */
export function referencedFileIds(content: Pick<SopContent, "sections">): string[] {
  const ids = new Set<string>();
  for (const s of content.sections)
    for (const b of s.blocks) {
      if ((b.type === "image" || b.type === "attachment") && b.fileId) ids.add(b.fileId);
      if (b.type === "video" && b.fileId) ids.add(b.fileId);
    }
  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Plain-text projection + line diff (version comparison)
// ---------------------------------------------------------------------------

function blockLines(b: SopBlock): string[] {
  switch (b.type) {
    case "paragraph":
      return b.text.split("\n");
    case "heading":
      return [`${b.level === 3 ? "###" : "##"} ${b.text}`];
    case "steps":
      return b.items.map((t, i) => `${i + 1}. ${t}`);
    case "bullets":
      return b.items.map((t) => `• ${t}`);
    case "table":
      return [`| ${b.header.join(" | ")} |`, ...b.rows.map((r) => `| ${r.join(" | ")} |`)];
    case "checklist":
      return [...(b.title ? [`Checklist: ${b.title}`] : []), ...b.items.map((i) => `☐ ${i.text}`)];
    case "image":
      return [`[Image] ${b.alt || b.caption || b.fileId}`];
    case "video":
      return [`[Video] ${b.url ?? b.fileId ?? ""}${b.caption ? ` — ${b.caption}` : ""}`];
    case "attachment":
      return [`[Attachment] ${b.label || b.fileId}`];
    case "link":
      return [`[Link] ${b.label || b.url} → ${b.url}`];
    default:
      return b.text.split("\n").map((l, i) => (i === 0 ? `${b.type.toUpperCase()}: ${l}` : l));
  }
}

/** Flattens a document into comparable lines. */
export function contentLines(c: SopContent): string[] {
  const lines: string[] = [`Title: ${c.title}`, `Description: ${c.description}`, "# Purpose", ...c.purpose.split("\n"), "# Scope", ...c.scope.split("\n")];
  for (const s of c.sections) {
    lines.push(`# ${s.title}`);
    for (const b of s.blocks) lines.push(...blockLines(b));
  }
  if (c.relatedPolicies.length) {
    lines.push("# Related Policies", ...c.relatedPolicies.map((p) => `${p.title}${p.url ? ` → ${p.url}` : ""}`));
  }
  return lines.map((l) => l.trimEnd());
}

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** Classic LCS line diff. Falls back to a whole-document replace above the size cap. */
export function diffLines(a: string[], b: string[]): DiffLine[] {
  const MAX = 3000;
  if (a.length > MAX || b.length > MAX) {
    return [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
  }
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: a[i++] });
    } else {
      out.push({ kind: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

export function diffStats(d: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const l of d) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}

/** Next version string. First publish is 1.0; minor → 1.1; major → 2.0. */
export function nextVersion(current: string | null, kind: "minor" | "major"): string {
  if (!current) return "1.0";
  const [maj, min] = current.split(".").map((n) => Number(n));
  const major = Number.isFinite(maj) ? maj : 1;
  const minor = Number.isFinite(min) ? min : 0;
  return kind === "major" ? `${major + 1}.0` : `${major}.${minor + 1}`;
}
