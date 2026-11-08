/** Legacy IANA aliases that browsers/Node report but MongoDB's timezone database rejects. */
const ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

/** The server's time zone as a name MongoDB accepts for `$dateToString` and friends. */
export function mongoTimeZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return ALIASES[tz] ?? tz;
}
