export type DashboardGranularity = "day" | "week" | "month" | "year";

export function dateFormatFor(granularity: DashboardGranularity): string {
  switch (granularity) {
    case "week":
      return "%G-W%V";
    case "month":
      return "%Y-%m";
    case "year":
      return "%Y";
    default:
      return "%Y-%m-%d";
  }
}
