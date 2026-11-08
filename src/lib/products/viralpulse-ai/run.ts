import "server-only";
import { revalidatePath } from "next/cache";
import type { SmmsPermission } from "@/lib/smms-roles";
import { requireViewer, can, SmmsInputError, ForbiddenError, NotFoundError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { aiErrorMessage } from "@/lib/products/viralpulse-ai/ai";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Wrapper every SMMS server action goes through: resolves the viewer from the
 * SESSION COOKIE (never from arguments), checks ALL listed permissions, and
 * maps failures to `{ ok:false, error }`. OpenAI errors get a friendly,
 * key-free message.
 */

export type Fail = { ok: false; error: string };
export type Ok<T = object> = { ok: true } & T;
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };
const DENIED: Fail = { ok: false, error: "You don't have permission to do that." };

export async function run<T extends object>(permissions: SmmsPermission[], fn: (v: SmmsViewer) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<Ok<T> | Fail> {
  let v: SmmsViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  if (!permissions.every((p) => can(v, p))) return DENIED;
  // Suspended/canceled workspaces are read-only: block anything beyond viewing.
  if (permissions.some((p) => !p.startsWith("VIEW_"))) {
    const readOnly = await writeBlockReason();
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    const out = await fn(v);
    if (opts.revalidate !== false) revalidatePath("/viralpulse-ai", "layout");
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof SmmsInputError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return DENIED;
    if (err instanceof NotFoundError) return { ok: false, error: "That item no longer exists." };
    const status = (err as { status?: number })?.status;
    if (typeof status === "number") return { ok: false, error: aiErrorMessage(err) };
    console.error("[smms action]", (err as Error)?.message?.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"));
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
