import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

/**
 * Content hash of a PBDoc: SHA-256 of its canonical JSON (hex). Server-only (Node crypto). Hash a document only AFTER `parseDoc`, so the
 * input is normalised; two documents with the same content and block ids then always get the same hash.
 */
export function contentHash(doc: PBDoc): string {
  return createHash("sha256").update(canonicalJson(doc), "utf8").digest("hex");
}

/** SHA-256 hex of arbitrary bytes or text (exported PDF/DOCX files). */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
