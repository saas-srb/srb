import type { Guard } from "../types";

/** DataBrain coverage: see `coverage/cybervault.ts` for the rules. Keys are paths under src/app/(products), `#function` for server actions. One feature opens the product (the layout checks it for every page; the chat route and the actions check it themselves). */
const P = "databrain-ai/(protected)";
const open = (open: "self-service" | "session" | "public" | "redirect", reason: string): Guard => ({ open, reason });
const layout: Guard = { any: ["ask.use"], viaLayout: true, via: "dbCanAsk" };

export const DATABRAIN_ROOTS = ["src/app/(products)/databrain-ai", "src/app/(products)/api/databrain-ai"];

export const DATABRAIN_COVERAGE: Record<string, Guard> = {
  "databrain-ai/login/page.tsx": open("public", "The sign-in page."),
  [`${P}/[...notFound]/page.tsx`]: open("public", "The not-found page inside the product."),
  [`${P}/notifications/page.tsx`]: open("self-service", "A person's own notifications."),
  [`${P}/page.tsx`]: layout,
  [`${P}/c/[id]/page.tsx`]: layout,
  [`${P}/actions.ts#deleteConversationAction`]: { any: ["ask.use"], via: "dbCanAsk" },
  [`${P}/actions.ts#intelligenceLogoutAction`]: open("self-service", "Ends the signed-in person's own session."),
  "api/databrain-ai/chat/route.ts": { any: ["ask.use"], via: "prepareTurn" },
};

/** Features no mapped item names, with where they are enforced. */
export const DATABRAIN_EXTRA: Record<string, string> = {};
