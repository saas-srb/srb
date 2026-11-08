import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Explicit locale so server-rendered and client-hydrated output always match —
// omitting it falls back to the runtime's default locale, which can differ
// between the Node server and the browser and trigger a hydration mismatch.
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Explicit locale (see formatDate) so server and client render identically.
export function formatCurrency(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString("en-IN")}`
  }
}

/** Compact number for chart axes / tiles: 12.3K, 4.5M. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${value > 0 ? "+" : ""}${value}%`
}
