import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import PromptManager from "@/components/platform/prompts/PromptManager";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getFeatureControls } from "@/lib/platform/feature-controls";
import { listPanels } from "@/lib/platform/panels/store";
import { PROMPTS } from "@/lib/prompts/registry";
import { companyPromptCounts } from "@/lib/prompts/company-store";
import { listPromptStatus } from "@/lib/prompts/store";
import CompanyPromptsSwitch from "./CompanyPromptsSwitch";
import { promptHistoryAction, resetPromptAction, restorePromptAction, savePromptAction, setCompanyPromptAllowedAction, setPromptEnabledAction, testPromptAction } from "./actions";

export const metadata: Metadata = { title: "AI prompts" };
export const dynamic = "force-dynamic";

export default async function PlatformPromptsPage() {
  const user = await requirePlatformPermission("settings.read");
  const [status, panels, controls, using] = await Promise.all([listPromptStatus(), listPanels().catch(() => []), getFeatureControls(), companyPromptCounts().catch(() => ({}) as Record<string, number>)]);
  const canEdit = can(user, "settings.manage");
  const companyUse = Object.fromEntries(PROMPTS.filter((p) => p.companyEditable).map((p) => [p.key, { allowed: controls.prompts[p.key] !== false, using: using[p.key] ?? 0 }]));
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="AI prompts"
        description="Every instruction the system gives to an AI model. Change the wording here and it applies to every company within seconds, with a history you can go back to. Anything you haven't changed uses the built-in text."
        crumbs={[{ label: "Administration" }]}
      />
      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Every change is a new numbered version. Nothing is ever removed: you can go back to any version, or to the built-in text, at any time, and going back is itself a new version. Not listed here because they are not wording: the shapes of the data models must answer in, the field labels filled into prompts, the fixed replies a screen shows by itself, and text each company writes for its own chatbot or bots (the starting text for those is listed).
      </p>
      <CompanyPromptsSwitch enabled={controls.companyPrompts} canEdit={canEdit} count={Object.values(using).reduce((a, b) => a + b, 0)} />
      <PromptManager
        scope="platform"
        prompts={PROMPTS}
        status={status}
        products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))}
        canEdit={canEdit}
        companyUse={companyUse}
        api={{ save: savePromptAction, setEnabled: setPromptEnabledAction, reset: resetPromptAction, restore: restorePromptAction, history: promptHistoryAction, test: testPromptAction, setCompanyAllowed: setCompanyPromptAllowedAction }}
      />
    </div>
  );
}
