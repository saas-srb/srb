import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/evaliq/db";
import { OtsInputError } from "@/lib/products/evaliq/viewer";

/** Product-wide OTS settings (one document). Per-test behaviour lives on each test's own configuration. */

export interface OtsSettings {
  /** Printed on certificates. Defaults to the site's organisation name. */
  organizationName: string;
  /** `{yyyy}` = year, `{n}` = zero-padded sequence. */
  certificateNumberFormat: string;
  signatoryName: string;
  signatoryTitle: string;
  /** Default certificate validity for new certification tests; 0 = never expires. */
  defaultValidityMonths: number;
  /** "Deadline approaching" reminder lead time. */
  reminderHoursBeforeDue: number;
  /** Seconds after the timer hits zero during which a final answer save / submit is still accepted (network slack). */
  graceSeconds: number;
  /** Staff who get "answers waiting for evaluation" notices, in addition to the test's creator. */
  evaluatorUserIds: string[];
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DEFAULTS: OtsSettings = {
  organizationName: "",
  certificateNumberFormat: "EvalIQ-{yyyy}-{n}",
  signatoryName: "",
  signatoryTitle: "Head of Assessments",
  defaultValidityMonths: 24,
  reminderHoursBeforeDue: 24,
  graceSeconds: 20,
  evaluatorUserIds: [],
  updatedAt: null,
  updatedBy: null,
};

export async function getOtsSettings(): Promise<OtsSettings> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string } & Partial<OtsSettings>>(COLLECTIONS.settings).findOne({ _id: "global" });
  const { _id: _ignored, ...rest } = doc ?? { _id: "" };
  void _ignored;
  return { ...DEFAULTS, ...rest };
}

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : dflt;
};

export async function saveOtsSettings(input: Record<string, unknown>, actorId: string): Promise<{ before: OtsSettings; after: OtsSettings }> {
  const before = await getOtsSettings();
  const fmt = String(input.certificateNumberFormat ?? before.certificateNumberFormat).trim().slice(0, 60);
  if (!fmt.includes("{n}")) throw new OtsInputError("The certificate number format must contain {n}.");
  const after: OtsSettings = {
    organizationName: String(input.organizationName ?? "").trim().slice(0, 120) || DEFAULTS.organizationName,
    certificateNumberFormat: fmt,
    signatoryName: String(input.signatoryName ?? "").trim().slice(0, 80),
    signatoryTitle: String(input.signatoryTitle ?? "").trim().slice(0, 80),
    defaultValidityMonths: num(input.defaultValidityMonths, 0, 240, before.defaultValidityMonths),
    reminderHoursBeforeDue: num(input.reminderHoursBeforeDue, 1, 24 * 14, before.reminderHoursBeforeDue),
    graceSeconds: num(input.graceSeconds, 0, 120, before.graceSeconds),
    evaluatorUserIds: Array.isArray(input.evaluatorUserIds) ? input.evaluatorUserIds.filter((x): x is string => typeof x === "string").slice(0, 50) : before.evaluatorUserIds,
    updatedAt: new Date(),
    updatedBy: actorId,
  };
  const db = await getDb();
  await db.collection<{ _id: string } & OtsSettings>(COLLECTIONS.settings).updateOne({ _id: "global" }, { $set: after }, { upsert: true });
  return { before, after };
}
