import { AsyncLocalStorage } from "node:async_hooks";

/** Who is behind a use of a metered resource (shown per person on the Usage & limits page). */
export interface UsageActor {
  /** `user:<admin id>`, `portal:<id>`, `visitor`, `system` — stable, used to group. */
  key: string;
  kind: "user" | "portal" | "visitor" | "system";
  id: string | null;
  /** Name or email, or a plain description ("Website visitors", "Automatic (background task)"). */
  label: string;
}

export const SYSTEM_ACTOR: UsageActor = { key: "system", kind: "system", id: null, label: "Automatic (background tasks)" };
export const VISITOR_ACTOR: UsageActor = { key: "visitor", kind: "visitor", id: null, label: "Website visitors" };

const store = new AsyncLocalStorage<UsageActor>();

/** Runs `fn` with `actor` as the person behind every use inside it (background work scheduled by a request keeps its owner). */
export function withUsageActor<T>(actor: UsageActor, fn: () => T): T {
  return store.run(actor, fn);
}

export function storedUsageActor(): UsageActor | undefined {
  return store.getStore();
}
