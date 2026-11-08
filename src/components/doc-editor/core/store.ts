import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

/**
 * The storage adapter the editor talks to. Product-neutral: Playbook backs it with its documents API, ContractFlow with its clone store.
 * Versions are opaque strings (the server decides what they are); the editor only hands back the one it last received.
 */
export interface DocumentSnapshot {
  id: string;
  doc: PBDoc;
  /** Opaque concurrency token. `save` must be given the token of the version the edit started from. */
  version: string;
  updatedAt?: string;
}

export interface SaveRequest {
  id: string;
  doc: PBDoc;
  baseVersion: string;
}

export interface SaveResult {
  version: string;
  savedAt?: string;
}

export interface DocumentStore {
  load(id: string): Promise<DocumentSnapshot>;
  /** Must throw `DocumentConflictError` (or an error whose `code` is "CONFLICT") when `baseVersion` is no longer the current version. Never overwrite. */
  save(req: SaveRequest): Promise<SaveResult>;
}

export class DocumentConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor(message = "Someone else changed this document.", readonly currentVersion?: string) {
    super(message);
    this.name = "DocumentConflictError";
  }
}

/** True for the typed conflict error, including one that crossed a server-action boundary and lost its prototype. */
export function isConflictError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: unknown; name?: unknown };
  return o.code === "CONFLICT" || o.name === "DocumentConflictError";
}
