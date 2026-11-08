import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import PromptManager from "@/components/platform/prompts/PromptManager";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { writeBlockReason } from "@/lib/platform/billing/enforce";
import { companyMayEditPrompt, getFeatureControls } from "@/lib/platform/feature-controls";
import { listPanels } from "@/lib/platform/panels/store";
import { PROMPTS } from "@/lib/prompts/registry";
import { listCompanyPromptStatus } from "@/lib/prompts/company-store";
import { promptText } from "@/lib/prompts/store";
import { companyPromptHistoryAction, resetCompanyPromptAction, restoreCompanyPromptAction, saveCompanyPromptAction, setCompanyPromptEnabledAction, testCompanyPromptAction } from "./actions";

export const metadata: Metadata = { title: "AI prompts", robots: { index: false, follow: false } };

/** How this workspace's AI assistants are told to write and behave: the prompts that allow it can be changed for this company only. */
export default async function CompanyPromptsPage() {
  await requireWorkspaceAccess("company.prompts");
  const controls = await getFeatureControls();
  const [status, panels, readOnly] = await Promise.all([listCompanyPromptStatus(), listPanels().catch(() => []), writeBlockReason()]);
  // Every prompt is listed. The ones a company may change carry the standard text now in force; the rest carry no text at all (it never reaches the browser).
  const prompts = await Promise.all(
    PROMPTS.map(async (p) => {
      const open = !!p.companyEditable && companyMayEditPrompt(controls, p.key);
      return { ...p, companyEditable: open, text: open ? (await promptText(p.key)).text : "", usedBy: [] as string[], note: undefined };
    }),
  );
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "AI prompts" }]}
          title={<>AI prompts</>}
          description={<>How your AI assistants are told to write and behave. Change the wording for your own workspace, see exactly what is sent, try it, and go back to any earlier version at any time. Other companies are never affected, and SelfRun&apos;s fixed security rules are always applied around your wording.</>}
        />
        {!controls.companyPrompts && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">SelfRun has turned off changes to AI prompts. Your assistants use the standard wording; what you saved is kept and applies again when it is turned back on.</p>}
        {readOnly && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{readOnly}</p>}
        <PromptManager
          scope="company"
          prompts={prompts}
          status={status}
          products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))}
          canEdit={!readOnly && controls.companyPrompts}
          api={{ save: saveCompanyPromptAction, setEnabled: setCompanyPromptEnabledAction, reset: resetCompanyPromptAction, restore: restoreCompanyPromptAction, history: companyPromptHistoryAction, test: testCompanyPromptAction }}
        />
      </div>
    </div>
  );
}
