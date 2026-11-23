import type { CardStatus } from "@/lib/platform/connections/cards";
import type { ConnState } from "@/lib/platform/setup-progress/types";

/**
 * How an Integrations card counts toward setup (pure). "Included default" counts as done: SRB provides it. Your own keys count as done once Test passes; saved
 * but never tested is partial (when the service can be tested), a failed test is partial too. "Not available from SRB" and "Not set up" are to do.
 */
export function connectionState(status: CardStatus, o: { testable?: boolean; lastTestOk?: boolean | null } = {}): { state: ConnState; detail: string } {
  switch (status) {
    case "ready": return { state: "done", detail: "Ready." };
    case "using_srb": return { state: "done", detail: "The included default is used. Nothing to set up." };
    case "using_own":
      if (o.lastTestOk === true || !o.testable) return { state: "done", detail: o.lastTestOk === true ? "Your own account works (test passed)." : "Your own account is connected." };
      return { state: "partial", detail: "Your own keys are saved. Press Test to confirm they work." };
    case "needs_attention": return { state: "partial", detail: "The last test failed. Check the keys." };
    case "srb_unavailable": return { state: "todo", detail: "No included default. Add your own account." };
    default: return { state: "todo", detail: "Not set up yet." };
  }
}
