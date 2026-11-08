import "server-only";
import type { AibotsPermission } from "@/lib/aibots-roles";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";
import { AibotsInputError, ForbiddenError, NotFoundError, can, getViewer, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { ElevenLabsAgentError } from "@/lib/products/agentos/voice/elevenlabs-agent";
import type { CallFailure } from "@/lib/products/agentos/calls/types";

/**
 * Shared runner for the calling server actions. The viewer always comes from the AgentOS session cookie (never from arguments),
 * the permission is re-checked here, and every error becomes a message a person can act on. Used by the cross-product actions
 * (calls/actions.ts) and the AgentOS phone pages (phone-actions.ts).
 */

export type ActionFail = { ok: false; error: string; failure?: CallFailure };
export type ActionOk<T> = { ok: true } & T;
export type ActionResult<T> = ActionOk<T> | ActionFail;

export const NO_ACCOUNT_MESSAGE = "Calling is part of AgentOS, and you don't have an AgentOS account yet. Ask an admin to give you access to AgentOS.";
export const NO_PERMISSION_MESSAGE = "You don't have permission to place calls. Ask an admin to allow \"Place voice calls\" for you in AgentOS.";
export const SESSION_MESSAGE = "Your AgentOS session has expired. Sign in again to continue.";

export interface RunOptions {
  permission?: AibotsPermission | null;
  /** Writes are refused while the plan is read-only. */
  write?: boolean;
  /** What to say when the person has no AgentOS session (other products explain it differently from AgentOS itself). */
  noSession?: string;
  noPermission?: string;
}

/** Maps a thrown error to the sentence shown to the person. Unknown errors are logged and never leaked. */
export function messageFor(err: unknown): string {
  if (err instanceof AibotsInputError || err instanceof ElevenLabsAgentError || isBillingLimitError(err)) return err.message;
  if (err instanceof ForbiddenError) return "You don't have permission to do that.";
  if (err instanceof NotFoundError) return "That call, number or agent is no longer available.";
  console.error("[agentos calls action]", err instanceof Error ? err.message : err);
  return "Something went wrong. Please try again.";
}

export async function runCallAction<T extends object>(opts: RunOptions, fn: (viewer: AibotsViewer) => Promise<ActionResult<T> | T>): Promise<ActionResult<T>> {
  const viewer = await getViewer().catch(() => null);
  if (!viewer) return { ok: false, error: opts.noSession ?? SESSION_MESSAGE };
  if (opts.permission && !can(viewer, opts.permission)) return { ok: false, error: opts.noPermission ?? "You don't have permission to do that." };
  if (opts.write) {
    const readOnly = await writeBlockReason().catch(() => null);
    if (readOnly) return { ok: false, error: readOnly };
  }
  try {
    const out = await fn(viewer);
    if (typeof (out as { ok?: unknown }).ok === "boolean") return out as ActionResult<T>;
    return { ok: true, ...(out as T) };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}
