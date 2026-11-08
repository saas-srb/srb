/**
 * One simple, client-safe transactional layout (inline styles, single column)
 * producing both the HTML and the plain-text part. Every interpolated value
 * is escaped — company and person names are user input.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailContent {
  /** Shown as the sender brand at the top (the platform, or a company). */
  brand: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the button, e.g. "This link expires in 24 hours." */
  footnote?: string;
  /** Button / brand colour as `#rrggbb` (a company's theme colour); default is a neutral dark. */
  accent?: string;
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const accent = c.accent && /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : "#111827";
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(t)}</p>`;
  const button = c.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(c.action.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapeHtml(c.action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#64748b">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(c.action.url)}</span></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:14px;font-weight:700;color:${accent}">${escapeHtml(c.brand)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map(p).join("\n")}
${button}
${c.footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b">${escapeHtml(c.footnote)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [c.heading, "", ...c.paragraphs.flatMap((t) => [t, ""]), ...(c.action ? [`${c.action.label}: ${c.action.url}`, ""] : []), ...(c.footnote ? [c.footnote] : [])].join("\n").trim();
  return { html, text };
}
