import type { CatalogueEntry } from "./types";

const VERBS = new Set([
  "manage", "view", "edit", "create", "delete", "update", "approve", "reject", "run", "send", "issue", "refund", "read", "write", "use", "access",
  "export", "import", "download", "upload", "publish", "unpublish", "assign", "archive", "restore", "reveal", "take", "place", "moderate", "configure",
  "can", "is", "has", "all", "own", "my", "see", "list", "open", "connect", "launch", "generate", "post", "comment", "acknowledge", "reconcile", "verify",
  "invite", "grant", "revoke", "share", "reply", "submit", "review", "sign", "void", "pay", "mark", "set", "change", "add", "remove",
]);

const title = (words: string[]) => words.join(" ").replace(/^./, (c) => c.toUpperCase());

/**
 * The area a feature is shown under inside its product: the noun the capability is about ("Employees", "Announcements", "Audit").
 * Derived from the capability name (the verbs are dropped), so it is stable and needs no hand-kept list. Entry gates have their own area.
 */
export function areaOf(e: Pick<CatalogueEntry, "fn" | "perm" | "kind">): string {
  if (e.kind === "tier") return "Who can open this product";
  const raw = e.perm ?? e.fn;
  const words = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const nouns = words.filter((w) => !VERBS.has(w));
  if (nouns.length === 0) return "General";
  return title(nouns.slice(0, 2));
}
