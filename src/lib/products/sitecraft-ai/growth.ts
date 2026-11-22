import "server-only";
import { getCurrentLmsUser, type CurrentLmsUser } from "@/lib/lms-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";

/**
 * The shared growth tools (Offers & coupons, Wallets & rewards) live in SiteCraft but are also a DealFlow capability. One check serves both:
 * a person holds a tool through SiteCraft (`sitecraft-ai.offers.manage` / `wallet.manage`) OR through DealFlow (`dealflow-ai.offers.manage` /
 * `wallet.manage`). Each person keeps exactly the side they had; neither side grants the other, so nobody gains or loses anything.
 */
export type GrowthTool = "offers" | "wallet";
/** The feature each tool is held through (the same short key in SiteCraft and in DealFlow). */
const FEATURE: Record<GrowthTool, string> = { offers: "offers.manage", wallet: "wallet.manage" };

const TOOL_LABEL: Record<GrowthTool, string> = { offers: "Offers & coupons", wallet: "Wallets & rewards" };
export const growthLabel = (tool: GrowthTool) => TOOL_LABEL[tool];

export function growthAllowed(subject: AccessSubject, tool: GrowthTool): boolean {
  return accessCan(subject, "sitecraft-ai", `sitecraft-ai.${FEATURE[tool]}`, "write") || accessCan(subject, "dealflow-ai", `dealflow-ai.${FEATURE[tool]}`, "write");
}

/** Exporting the subscribers / wallet data: the DealFlow export feature, or a SiteCraft person who manages settings (the same two doors as before). */
export function growthMayExport(subject: AccessSubject): boolean {
  return accessCan(subject, "dealflow-ai", "dealflow-ai.data.export", "read") || accessCan(subject, "sitecraft-ai", "sitecraft-ai.settings.manage", "write");
}

/** The signed-in person when they hold the tool through either product, else null. */
export async function requireGrowth(tool: GrowthTool): Promise<CurrentLmsUser | null> {
  const user = await getCurrentLmsUser();
  return user && growthAllowed(user.subject, tool) ? user : null;
}

export async function requireGrowthExport(): Promise<CurrentLmsUser | null> {
  const user = await getCurrentLmsUser();
  return user && growthMayExport(user.subject) ? user : null;
}

/** The chatbot tools: the DealFlow chatbot feature, or a SiteCraft person who manages settings (the same two doors as before). */
export async function requireChatbot(capability: "view" | "manage"): Promise<CurrentLmsUser | null> {
  const user = await getCurrentLmsUser();
  if (!user) return null;
  const dealflow = accessCan(user.subject, "dealflow-ai", `dealflow-ai.${capability === "manage" ? "chatbot.manage" : "chatbot.view"}`, capability === "manage" ? "write" : "read");
  const sitecraft = accessCan(user.subject, "sitecraft-ai", "sitecraft-ai.settings.manage", "write");
  return dealflow || sitecraft ? user : null;
}
