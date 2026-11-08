/** Search-result length guidelines (characters) — shared by the SEO Overview and the dashboard's Site Health. */
export const SEO_TITLE_LENGTH = { min: 30, max: 60 };
export const SEO_DESCRIPTION_LENGTH = { min: 70, max: 160 };

/** Human-readable problems with a page's search appearance (empty = looks good). */
export function seoIssues(r: { title: string; description: string; canonical: string | null; noindex: boolean }): string[] {
  const TITLE = SEO_TITLE_LENGTH;
  const DESC = SEO_DESCRIPTION_LENGTH;
  const out: string[] = [];
  if (!r.title) out.push("Missing SEO title");
  else if (r.title.length > TITLE.max) out.push(`Title is long (${r.title.length})`);
  else if (r.title.length < TITLE.min) out.push(`Title is short (${r.title.length})`);
  if (!r.description) out.push("Missing meta description");
  else if (r.description.length > DESC.max) out.push(`Description is long (${r.description.length})`);
  else if (r.description.length < DESC.min) out.push(`Description is short (${r.description.length})`);
  if (!r.canonical && !r.noindex) out.push("No canonical URL");
  return out;
}
