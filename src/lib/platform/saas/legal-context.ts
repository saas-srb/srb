import "server-only";
import { saasContact } from "@/lib/platform/saas/brand";
import { saasCanonicalHost } from "@/lib/platform/saas/hosts";
import { requestHostOrNull } from "@/lib/platform/saas/request";
import { getLegalProfile } from "@/lib/platform/saas/legal-profile";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import type { LegalContext } from "@/lib/platform/saas/legal-india";

/** What the public legal pages are written from: the operator's profile (Console → Legal & compliance) and the contact addresses of this host. */
export async function loadLegalContext(): Promise<LegalContext> {
  const [profile, host] = await Promise.all([getLegalProfile(), requestHostOrNull()]);
  const c = saasContact(saasCanonicalHost(host));
  return { name: SAAS_BRAND.name, profile, mail: { privacy: c.privacy, security: c.security, support: c.support } };
}
