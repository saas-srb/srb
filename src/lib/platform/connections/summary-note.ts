import type { CardStatus } from "@/lib/platform/connections/cards";

/** The plain sentence under a status badge (pure, client-safe: the page, the summaries and the dev harness share it). */
export function noteFor(status: CardStatus, canSrb: boolean, lastTestMessage?: string | null): string {
  if (status === "using_srb") return "SelfRun's account is used. Nothing to set up.";
  if (status === "needs_attention") return `Last test failed: ${lastTestMessage ?? "check your keys"}`;
  if (status === "using_own") return "Your own account is used.";
  return canSrb ? "Not available from SRB, add your own." : "Connect your account to use it.";
}
