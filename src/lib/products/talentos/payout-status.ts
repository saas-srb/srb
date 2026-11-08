/** Client-safe salary payout status metadata (no I/O). */

export const PAYOUT_STATUSES = [
  { value: "pending", label: "Pending", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "initiated", label: "Initiated", badgeClass: "bg-primary/15 text-primary", dotClass: "bg-primary" },
  { value: "processing", label: "Processing", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "paid", label: "Paid", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "failed", label: "Failed", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]["value"];

export function isValidPayoutStatus(v: string): v is PayoutStatus {
  return PAYOUT_STATUSES.some((s) => s.value === v);
}

export function payoutStatusMeta(v: string | undefined) {
  return PAYOUT_STATUSES.find((s) => s.value === v) ?? PAYOUT_STATUSES[0];
}

/** Terminal states — a run is fully paid only when every non-cancelled payout is `paid`. */
export const PAYOUT_TERMINAL: PayoutStatus[] = ["paid", "cancelled"];

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  pending: ["initiated", "cancelled"],
  initiated: ["processing", "paid", "failed", "cancelled"],
  processing: ["paid", "failed"],
  failed: ["initiated", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canPayoutTransition(from: string, to: string): boolean {
  return isValidPayoutStatus(from) && isValidPayoutStatus(to) && PAYOUT_TRANSITIONS[from].includes(to);
}

export const BANK_VERIFICATION_STATUSES = [
  { value: "unverified", label: "Unverified", badgeClass: "bg-muted text-muted-foreground" },
  { value: "pending", label: "Verification pending", badgeClass: "bg-secondary/60 text-secondary-foreground" },
  { value: "verified", label: "Verified", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { value: "failed", label: "Verification failed", badgeClass: "bg-destructive/15 text-destructive" },
] as const;

export type BankVerificationStatus = (typeof BANK_VERIFICATION_STATUSES)[number]["value"];

export function isValidBankVerificationStatus(v: string): v is BankVerificationStatus {
  return BANK_VERIFICATION_STATUSES.some((s) => s.value === v);
}

export function bankVerificationMeta(v: string | undefined) {
  return BANK_VERIFICATION_STATUSES.find((s) => s.value === v) ?? BANK_VERIFICATION_STATUSES[0];
}

export const ACCOUNT_TYPES = [
  { value: "savings", label: "Savings" },
  { value: "current", label: "Current" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

export function isValidAccountType(v: string): v is AccountType {
  return ACCOUNT_TYPES.some((t) => t.value === v);
}
