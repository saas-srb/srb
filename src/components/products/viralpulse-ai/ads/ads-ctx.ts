import type { Dispatch } from "react";
import type { AdAccountInfo, AudienceInfo, NamedId } from "@/lib/products/viralpulse-ai/ads-platforms/meta/account";
import type { StrategyView, WizardAccounts } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import type { WizardAction, WizardState } from "@/lib/products/viralpulse-ai/ads-platforms/ui";

export interface AccountContext {
  info: AdAccountInfo;
  pixels: NamedId[];
  audiences: AudienceInfo[];
  instagram: (NamedId & { username: string | null })[];
  problems: Record<string, string>;
  readAt: string;
}

/** What every step receives. `editable` is false while a launch exists in Meta (the draft is then changed with the launch controls). */
export interface StepCtx {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  editable: boolean;
  accounts: WizardAccounts;
  account: { data: AccountContext | null; status: "idle" | "loading" | "error"; error: string | null; reload: () => void };
  canGenerate: boolean;
  /** Brief + campaign facts handed to the AI on every field in the wizard. */
  aiContext: () => Record<string, unknown>;
  strategy: StrategyView | null;
}
