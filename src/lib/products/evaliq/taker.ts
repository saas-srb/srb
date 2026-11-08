import { clientIpFrom } from "@/lib/security/ip";
import "server-only";
import { headers } from "next/headers";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { portalCandidateRefs } from "@/lib/products/evaliq/people";
import { candidateKey, type CandidateRef } from "@/lib/products/evaliq/constants";

/**
 * Who is taking a test. There is ONE test engine for everyone; only the
 * sign-in differs:
 *   - "staff"  → an OTS session (`admin_users`: employees, staff, TMS student logins);
 *   - "portal" → an External Portal session (`external_users`: applicants, interns, trainees).
 * Each resolves to the candidate identities that login may act as, and every
 * engine call checks the attempt / assignment belongs to one of them.
 */

export type Channel = "staff" | "portal";

export interface Taker {
  channel: Channel;
  /** Audit actor id: `admin_users` id, or `portal:<external_users id>`. */
  actorId: string;
  actorEmail: string;
  name: string;
  refs: CandidateRef[];
  keys: string[];
}

export async function resolveTaker(channel: Channel): Promise<Taker | null> {
  if (channel === "staff") {
    const v = await getViewer();
    if (!v || !can(v, "TAKE_TEST")) return null;
    return { channel, actorId: v.userId, actorEmail: v.email, name: v.name, refs: v.candidates, keys: v.candidates.map(candidateKey) };
  }
  const u = await getCurrentPortalUser();
  if (!u || u.mustChangePassword) return null;
  const refs = portalCandidateRefs(u);
  if (refs.length === 0) return null;
  return { channel, actorId: `portal:${u.id}`, actorEmail: u.email, name: u.displayName, refs, keys: refs.map(candidateKey) };
}

export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const fwdRaw = clientIpFrom(h);
  const fwd = fwdRaw === "unknown" ? null : fwdRaw;
  return { ip: fwd ? fwd.slice(0, 64) : null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export interface CandidatePaths {
  tests: string;
  exam: string;
  results: string;
  certificates: string;
}

export function basePath(channel: Channel): CandidatePaths {
  return channel === "staff"
    ? { tests: "/evaliq/my-tests", exam: "/evaliq/take", results: "/evaliq/my-results", certificates: "/evaliq/certificates" }
    : { tests: "/clientos/tests", exam: "/clientos/exam", results: "/clientos/tests/results", certificates: "/clientos/tests/certificates" };
}
