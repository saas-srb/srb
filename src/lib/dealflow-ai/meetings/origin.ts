/** The public address the request came in on (links in mail and copied guest links must point at the company's own domain). */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto === "http" && !/^(localhost|127\.|\[::1\])/.test(host) ? "https" : proto}://${host}`;
}
