/** Client-safe recruitment offer status metadata (no I/O). */

export const OFFER_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "extended", label: "Extended", badgeClass: "bg-primary/15 text-primary", dotClass: "bg-primary" },
  { value: "accepted", label: "Accepted", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "declined", label: "Declined", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "withdrawn", label: "Withdrawn", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
  { value: "joined", label: "Joined", badgeClass: "bg-green-600/20 text-green-700 dark:text-green-400", dotClass: "bg-green-600" },
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number]["value"];

export function isValidOfferStatus(v: string): v is OfferStatus {
  return OFFER_STATUSES.some((s) => s.value === v);
}

export function offerStatusMeta(v: string | undefined) {
  return OFFER_STATUSES.find((s) => s.value === v) ?? OFFER_STATUSES[0];
}

/** Allowed manual transitions. `joined` is only ever set by employee conversion. */
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ["extended", "withdrawn"],
  extended: ["accepted", "declined", "withdrawn"],
  accepted: ["withdrawn"],
  declined: [],
  withdrawn: [],
  joined: [],
};

export function canTransition(from: string, to: string): boolean {
  return isValidOfferStatus(from) && isValidOfferStatus(to) && OFFER_TRANSITIONS[from].includes(to);
}
