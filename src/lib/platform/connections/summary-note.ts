import type { CardStatus } from "@/lib/platform/connections/cards";

/** The plain sentence under a status badge (pure, client-safe: the page, the summaries and the dev harness share it). */
export function noteFor(status: CardStatus, canSrb: boolean, lastTestMessage?: string | null): string {
  if (status === "using_srb") return "The included default is used. Nothing to set up.";
  if (status === "needs_attention") return `Last test failed: ${lastTestMessage ?? "check your keys"}`;
  if (status === "using_own") return "Your own account is used.";
  return canSrb ? "No included default, add your own." : "Connect your account to use it.";
}
