import { NextResponse } from "next/server";

/**
 * The embed script: a website adds `<script src="https://<company site>/agentos-public/embed.js" async></script>` where the directory should
 * appear (an element with id "selfrun-agents", or right after the script). It only creates a frame that points at the company's own
 * directory page on the SAME host the script came from, so no data is read cross-origin and no CORS header is needed (or sent). Which websites
 * may show that frame is decided by the page's `frame-ancestors` header, built from the allowed websites of the company's public agents.
 * The script carries no company data, so it is the same for everyone and can be cached.
 */
const SCRIPT = `(function () {
  var s = document.currentScript;
  if (!s || !s.src) return;
  var origin;
  try { origin = new URL(s.src).origin; } catch (e) { return; }
  var mount = document.getElementById("selfrun-agents");
  var f = document.createElement("iframe");
  f.src = origin + "/agentos-public/agents";
  f.title = "Talk to our voice agents";
  f.setAttribute("allow", "microphone");
  f.setAttribute("referrerpolicy", "origin");
  f.setAttribute("loading", "lazy");
  f.style.cssText = "width:100%;min-height:640px;border:0;display:block";
  if (mount) mount.appendChild(f); else s.parentNode.insertBefore(f, s.nextSibling);
})();
`;

export function GET() {
  return new NextResponse(SCRIPT, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
