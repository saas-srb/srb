"use strict";
/** The few screens the app draws itself (loading problems), coloured from the company's branding. Plain HTML, no scripts from outside. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function readable(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return "#111111";
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 150 ? "#111111" : "#ffffff";
}

function offlinePage(brand, { host, detail }) {
  const bg = brand.backgroundColor, primary = brand.themeColor, fg = readable(bg);
  const icon = brand.icon && brand.icon.path ? `<img alt="" src="${esc(require("node:url").pathToFileURL(brand.icon.path).href)}" width="72" height="72" style="border-radius:16px">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>${esc(brand.name)}</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${esc(bg)};color:${fg};font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none}
main{max-width:420px;padding:32px;text-align:center}h1{margin:18px 0 6px;font-size:24px}p{margin:0 0 20px;opacity:.75}small{display:block;margin-top:18px;opacity:.5}
button{border:0;border-radius:12px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer;background:${esc(primary)};color:${readable(primary)}}</style></head>
<body><main>${icon}<h1>${esc(brand.name)}</h1><p>We can't reach your workspace right now. Check your internet connection. This page retries on its own.</p>
<button id="r">Try again</button><small>${esc(host)}${detail ? ` · ${esc(detail)}` : ""}</small></main>
<script>document.getElementById("r").onclick=function(){window.desktop&&window.desktop.retry()}</script></body></html>`;
}

module.exports = { offlinePage, readable };
