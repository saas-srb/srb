import "server-only";
import { revalidatePath } from "next/cache";
import type { OtsPermission } from "@/lib/ots-roles";
import { requireViewer, can, OtsInputError, ForbiddenError, NotFoundError, type OtsViewer } from "@/lib/products/evaliq/viewer";
import { QuestionInputError } from "@/lib/products/evaliq/question-types";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Wrapper every staff-side OTS server action goes through: resolves the
 * viewer from the SESSION COOKIE (never from arguments), checks ALL listed
 * permissions, and maps failures to `{ ok:false, error }`.
 */

export type Fail = { ok: false; error: string };
export type Ok<T = object> = { ok: true } & T;
export const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };
export const DENIED: Fail = { ok: false, error: "You don't have permission to do that." };

export function mapError(err: unknown, tag: string): Fail {
  if (isBillingLimitError(err)) return { ok: false, error: err.message };
  if (err instanceof OtsInputError || err instanceof QuestionInputError) return { ok: false, error: err.message };
  if (err instanceof ForbiddenError) return DENIED;
  if (err instanceof NotFoundError) return { ok: false, error: "That item no longer exists." };
  console.error(`[${tag}]`, (err as Error)?.message);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function run<T extends object>(
  permissions: OtsPermission[],
  fn: (v: OtsViewer) => Promise<T>,
  opts: { revalidate?: boolean; any?: boolean } = {}
): Promise<Ok<T> | Fail> {
  let v: OtsViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  const allowed = opts.any ? permissions.some((p) => can(v, p)) : permissions.every((p) => can(v, p));
  if (!allowed) return DENIED;
  // Suspended/canceled workspaces are read-only: block anything beyond viewing.
  if (!permissions.every((p) => p.startsWith("VIEW_"))) {
    const readOnly = await writeBlockReason();
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    const out = await fn(v);
    if (opts.revalidate !== false) revalidatePath("/evaliq", "layout");
    return { ok: true, ...out };
  } catch (err) {
    return mapError(err, "ots action");
  }
}
