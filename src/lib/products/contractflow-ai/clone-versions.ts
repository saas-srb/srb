import "server-only";
import { randomUUID } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { diffDocs, summarizeDiff, type DocDiff } from "@/lib/products/playbook-ai/diff";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { cfCloneVersions, cfClones } from "./cf-db";
import type { CloneDoc, CloneResult, CloneVersionDoc, CloneVersionSummary, VersionSource } from "./clone-types";
import { canAccessPartyType } from "./parties";
import type { LpmsViewer } from "./types";

/**
 * Versions of a clone (P8). Every content save writes one row with the full content, so any two versions can be compared and any one can
 * be restored (a restore is itself a new version). Rows are never edited; only their `statusLog` grows ("sent", "signed", "voided"...).
 */

export async function recordVersion(c: Pick<CloneDoc, "_id" | "title" | "pbdoc" | "contentSha256">, number: number, by: { id: string | null; name: string | null }, summary: string, source: VersionSource): Promise<void> {
  const row: CloneVersionDoc = { _id: randomUUID(), cloneId: c._id, number, pbdoc: c.pbdoc, contentSha256: c.contentSha256, title: c.title, at: new Date(), by: by.id, byName: by.name, summary: summary.slice(0, 300), source, statusLog: [] };
  try {
    await (await cfCloneVersions()).insertOne(row);
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // the same number twice: already recorded
  }
}

/** Adds a status to a version ("sent", "signed"...). Quietly does nothing when that version row does not exist (clones older than this feature). */
export async function markVersionStatus(cloneId: string, number: number, status: string, note: string | null = null): Promise<void> {
  await (await cfCloneVersions()).updateOne({ cloneId, number }, { $push: { statusLog: { status, at: new Date(), note } } });
}

async function viewable(v: LpmsViewer, cloneId: string): Promise<CloneResult<{ clone: Pick<CloneDoc, "_id" | "rev" | "party" | "title"> }>> {
  const clone = typeof cloneId === "string" && cloneId.length <= 64 ? await (await cfClones()).findOne({ _id: cloneId }, { projection: { rev: 1, party: 1, title: 1 } }) : null;
  if (!clone) return { ok: false, error: { code: "not_found", message: "That document was not found." } };
  if (!lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "VIEW") || (clone.party.partyId && !canAccessPartyType(v, clone.party.type))) return { ok: false, error: { code: "forbidden", message: "You do not have access to this document." } };
  return { ok: true, clone };
}

export async function listCloneVersions(v: LpmsViewer, cloneId: string): Promise<CloneResult<{ versions: CloneVersionSummary[] }>> {
  const g = await viewable(v, cloneId);
  if (!g.ok) return g;
  const rows = await (await cfCloneVersions()).find({ cloneId }, { projection: { pbdoc: 0 } }).sort({ number: -1 }).limit(500).toArray();
  return { ok: true, versions: rows as CloneVersionSummary[] };
}

export async function getCloneVersion(v: LpmsViewer, cloneId: string, number: number): Promise<CloneResult<{ version: CloneVersionDoc }>> {
  const g = await viewable(v, cloneId);
  if (!g.ok) return g;
  const row = Number.isInteger(number) ? await (await cfCloneVersions()).findOne({ cloneId, number }) : null;
  return row ? { ok: true, version: row } : { ok: false, error: { code: "not_found", message: "That version does not exist." } };
}

export async function compareCloneVersions(v: LpmsViewer, cloneId: string, from: number, to: number): Promise<CloneResult<{ diff: DocDiff; summary: string; from: CloneVersionSummary; to: CloneVersionSummary; fromDoc: PBDoc; toDoc: PBDoc }>> {
  const a = await getCloneVersion(v, cloneId, from);
  if (!a.ok) return a;
  const b = await getCloneVersion(v, cloneId, to);
  if (!b.ok) return b;
  const diff = diffDocs(a.version.pbdoc, b.version.pbdoc);
  const strip = ({ pbdoc: _p, ...rest }: CloneVersionDoc): CloneVersionSummary => { void _p; return rest; };
  return { ok: true, diff, summary: summarizeDiff(diff), from: strip(a.version), to: strip(b.version), fromDoc: a.version.pbdoc, toDoc: b.version.pbdoc };
}
