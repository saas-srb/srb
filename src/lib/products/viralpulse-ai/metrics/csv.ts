import type { PostRow } from "./queries-types";

/** CSV of the filtered Posts & Reels table with the real values and when each was read from the platform. Pure. */
const esc = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // A cell that starts like a formula would run in Excel/Sheets: prefix it so it is read as text.
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ["Post", "Platform", "Account", "Published at (UTC)", "Format", "Reach", "Views", "Impressions", "Likes", "Comments", "Shares", "Saves", "Clicks", "Engagements", "Engagement rate %", "Rate based on", "Numbers read from platform at (UTC)", "Post link", "Platform post id", "Manually entered override"] as const;

export function postsToCsv(rows: PostRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const m = r.metrics;
    lines.push([
      r.title, r.platform, r.accountName, r.publishedAt, r.format, m.reach, m.views, m.impressions, m.likes, m.comments, m.shares, m.saves, m.clicks, r.engagements, r.rate ? Math.round(r.rate.value * 100) / 100 : null, r.rate?.denominator, r.syncedAt ?? "not synced yet", r.url, r.externalId,
      r.manual ? `entered manually by ${r.manual.by} on ${r.manual.at.slice(0, 10)}: ${Object.entries(r.manual.values).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ")}` : null,
    ].map(esc).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
