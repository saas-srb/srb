import type { PbSettings } from "@/lib/products/playbook-ai/pb-settings";
import type { TemplateApproval } from "@/lib/products/playbook-ai/tpl/types";

/**
 * The numbering prefix and approval policy a published template asks for, laid over the company settings. Pure.
 *
 * Precedence: a company setting written for that exact type always wins; the template's request fills in only where the company has said
 * nothing for the type; the catalogue's own suggested prefix is the last fallback (that part lives in `numberingFor`). The result is
 * meant for the numbering and approval steps; it must not be saved back as company settings (the settings page shows what the company chose).
 */
export function overlayTemplatePolicy(settings: PbSettings, policies: Record<string, { numberingPrefix: string | null; approval: TemplateApproval | null }>): PbSettings {
  const next: PbSettings = { ...settings, numbering: { ...settings.numbering, byType: { ...settings.numbering.byType } }, approval: { ...settings.approval, byType: { ...settings.approval.byType } } };
  for (const [typeId, p] of Object.entries(policies)) {
    if (p.numberingPrefix && !settings.numbering.byType[typeId]?.prefix) next.numbering.byType[typeId] = { ...settings.numbering.byType[typeId], prefix: p.numberingPrefix };
    if (p.approval) {
      const own = settings.approval.byType[typeId] ?? {};
      next.approval.byType[typeId] = {
        ...(p.approval.requireDifferentApprover !== undefined && own.requireDifferentApprover === undefined ? { requireDifferentApprover: p.approval.requireDifferentApprover } : {}),
        ...(p.approval.autoApproveOwn !== undefined && own.autoApproveOwn === undefined ? { autoApproveOwn: p.approval.autoApproveOwn } : {}),
        ...own,
      };
    }
  }
  return next;
}
