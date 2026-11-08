/**
 * Minimal, dependency-free User-Agent parsing — just enough to segment chat
 * analytics by device / browser / OS. Not meant to be exhaustive.
 */

export interface ParsedUserAgent {
  device: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { device: "unknown", browser: "Unknown", os: "Unknown" };
  const s = ua.toLowerCase();

  if (/bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|embedly/.test(s)) {
    return { device: "bot", browser: "Bot", os: "Unknown" };
  }

  const isTablet = /ipad/.test(s) || (/android/.test(s) && !/mobile/.test(s));
  const isMobile = !isTablet && /iphone|ipod|android.*mobile|windows phone|mobile/.test(s);
  const device: ParsedUserAgent["device"] = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let os = "Unknown";
  if (/windows nt/.test(s)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/mac os x/.test(s)) os = "macOS";
  else if (/android/.test(s)) os = "Android";
  else if (/cros/.test(s)) os = "ChromeOS";
  else if (/linux/.test(s)) os = "Linux";

  let browser = "Unknown";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/firefox\/|fxios/.test(s)) browser = "Firefox";
  else if (/chrome\/|crios/.test(s)) browser = "Chrome";
  else if (/safari\//.test(s)) browser = "Safari";

  return { device, browser, os };
}
