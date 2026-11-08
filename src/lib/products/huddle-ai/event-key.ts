/**
 * Isomorphic scope-key helpers — safe to import from client components
 * (unlike `events.ts`, which is `server-only`).
 */

export type EventScope =
  | { type: "dm"; id: string }
  | { type: "channel"; id: string }
  | { type: "user"; id: string }
  | { type: "call"; id: string }
  // Reused by Lead Management (`src/lib/lead-management/messages.ts`) for the portal↔staff
  // chat thread on a lead — this module has no Messenger-specific coupling, so it's shared
  // as-is rather than duplicated.
  | { type: "lead"; id: string };

export function scopeKey(scope: EventScope): string {
  return `${scope.type}:${scope.id}`;
}
