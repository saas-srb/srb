/** Client-safe holiday type constants (no I/O). */

export const HOLIDAY_TYPES = [
  { value: "public", label: "Public Holiday" },
  { value: "optional", label: "Optional / Restricted" },
  { value: "company", label: "Company Holiday" },
] as const;

export type HolidayType = (typeof HOLIDAY_TYPES)[number]["value"];

export function isValidHolidayType(v: string): v is HolidayType {
  return HOLIDAY_TYPES.some((t) => t.value === v);
}
