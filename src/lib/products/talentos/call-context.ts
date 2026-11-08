import { pickContext } from "@/lib/products/call-writeback";

/** The only candidate details TalentOS tells the calling agent about. Salary, notes, cover note, resume and email are never passed. */
export const CANDIDATE_CALL_CONTEXT = ["contact_name", "role_title"] as const;

export const CANDIDATE_PURPOSES = ["screening", "pre_hr"] as const;

export function candidateCallContext(app: { name?: unknown; positionTitle?: unknown }): Record<string, string> {
  return pickContext({ contact_name: app.name, role_title: app.positionTitle }, CANDIDATE_CALL_CONTEXT);
}
