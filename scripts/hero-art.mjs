/**
 * Generates the hero artwork of every page of the product website: public/selfrun/hero/<id>.webp.
 * Each image is composed from the product's real screenshots (public/selfrun/screens, public/selfrun/guide) on laptop and
 * browser frames, with floating chips that state what the product really does (taken from src/lib/saas/content.ts).
 *
 *   node scripts/hero-art.mjs [id ...]      (needs Google Chrome and Python with Pillow)
 *
 * It renders transparent PNGs with headless Chrome and converts them to WebP, so the page's own background shows through.
 *
 * It also draws every hero's BACKGROUND (id `bg-<id>`, 1920×820): a soft brand-coloured field with an abstract motif of the
 * area the page is about — a pipeline for CRM, an org chart for HR, charts for Finance, a Gantt for Projects, and so on.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as L from "lucide-react";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUB = path.join(ROOT, "public", "selfrun");
const OUT = path.join(PUB, "hero");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hero-"));
const P = "#4338ca", A = "#10b981", INK = "#0b1020";
const W = 1400, H = 980, DPR = 1.6;

const NAMES = { workspace: "Workspace", hrms: "HR & Payroll", lms: "CRM & Sales", fms: "Finance", pms: "Projects", prms: "Procurement & Assets", tms: "Training", messenger: "Team Chat", sop: "SOPs & Policies", lpms: "Legal & Documents", dlms: "Digi Locker", ots: "Online Tests", aibots: "AI Assistants", intelligence: "AI Intelligence", smms: "Social Media", seo: "SEO", cms: "Website", website: "Public Website", portal: "Client & Student Portal", support: "Help & Support" };
const PANEL_ICON = { workspace: "Zap", hrms: "Users", lms: "Target", fms: "Wallet", pms: "Layers", prms: "ShoppingCart", tms: "GraduationCap", messenger: "MessageSquare", sop: "BookOpen", lpms: "FileText", dlms: "Lock", ots: "Check", aibots: "Bot", intelligence: "Brain", smms: "Megaphone", seo: "Search", cms: "Globe", website: "Globe", portal: "Building2", support: "MessageSquare" };
/** Second and third screens shown beside the main one, per product. */
const EXTRA = { lms: ["lms-leads"], hrms: ["hrms-employees", "hrms-payroll"], fms: ["fms-invoices", "fms-profit-and-loss"], pms: ["pms-projects"], prms: ["prms-purchase-orders"], tms: ["tms-students"], sop: ["sop-library"], seo: ["seo-keywords"], smms: ["smms-posts"], cms: ["cms-pages", "cms-theme"], website: ["cms-pages", "domains"], messenger: ["messenger-channels"], dlms: ["dlms-credentials"], ots: ["ots-tests"], aibots: ["aibots-bots", "chatbot"], lpms: ["lpms-documents"], workspace: ["workspace-users", "workspace-audit"], intelligence: ["automations"], portal: ["workspace"], support: ["workspace"] };

// the product's own copy: automations per product, read from content.ts
const copy = fs.readFileSync(path.join(ROOT, "src/lib/saas/content.ts"), "utf8");
function automationsOf(key) {
  const m = copy.match(new RegExp(`\\n  ${key}: \\{[\\s\\S]*?automations: \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

const icon = (name, size = 22, color = "#fff", sw = 2.2) => renderToStaticMarkup(React.createElement(L[name] ?? L.Zap, { size, color, strokeWidth: sw }));
const shot = (k) => {
  for (const p of [`screens/${k}.webp`, `guide/${k}.webp`]) if (fs.existsSync(path.join(PUB, p))) return `file://${path.join(PUB, p)}`;
  return `file://${path.join(PUB, "screens/workspace.webp")}`;
};

/* ───────── building blocks ───────── */
const css = `
*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Inter,ui-sans-serif,system-ui,sans-serif;overflow:hidden}
.stage{position:relative;width:${W}px;height:${H}px}
.abs{position:absolute}
.glow{position:absolute;border-radius:50%;filter:blur(70px)}
.laptop{position:absolute;transform-origin:center}
.lid{background:linear-gradient(160deg,#2a2e3b,#12141b);border-radius:26px 26px 10px 10px;padding:14px 14px 18px;box-shadow:0 60px 90px -30px rgba(15,23,42,.55),0 0 0 1.5px rgba(255,255,255,.08) inset}
.lid .scr{position:relative;overflow:hidden;border-radius:10px;background:#000}
.lid .scr img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top}
.lid .cam{position:absolute;left:50%;top:5px;width:6px;height:6px;border-radius:50%;background:#0b0d12;transform:translateX(-50%)}
.base{height:16px;margin:0 -5.5%;border-radius:0 0 22px 22px;background:linear-gradient(#d9dde6,#9aa1af);box-shadow:0 30px 40px -12px rgba(15,23,42,.5);position:relative}
.base:after{content:"";position:absolute;left:50%;top:0;width:16%;height:55%;transform:translateX(-50%);border-radius:0 0 10px 10px;background:#8b92a1}
.card{position:absolute;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 40px 70px -24px rgba(15,23,42,.45),0 0 0 1px rgba(15,23,42,.06)}
.card .bar{height:30px;background:#f1f2f8;display:flex;align-items:center;gap:6px;padding:0 12px}
.card .bar i{width:9px;height:9px;border-radius:50%;display:block}
.card .bar i:nth-child(1){background:#f87171}.card .bar i:nth-child(2){background:#fbbf24}.card .bar i:nth-child(3){background:#34d399}
.card .bar b{margin-left:8px;font:600 11px Inter,sans-serif;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card img{display:block;width:100%;height:calc(100% - 30px);object-fit:cover;object-position:left top}
.chip{position:absolute;display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.94);backdrop-filter:blur(14px);border-radius:22px;padding:15px 22px 15px 15px;box-shadow:0 30px 60px -20px rgba(15,23,42,.4),0 0 0 1px rgba(15,23,42,.05);max-width:380px}
.chip .ic{width:48px;height:48px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${P},${A});flex:none;box-shadow:0 10px 22px -8px ${P}}
.chip .t{font:800 18px/1.15 Inter,sans-serif;color:${INK}}.chip .s{font:500 14px/1.3 Inter,sans-serif;color:#5b6478;margin-top:3px}
.badge{position:absolute;width:92px;height:92px;border-radius:28px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${P},${A});box-shadow:0 30px 50px -16px ${P},0 0 0 7px rgba(255,255,255,.7)}
.ring{position:absolute;border-radius:50%;border:2px dashed rgba(67,56,202,.28)}
.dot{position:absolute;border-radius:50%;background:${P}}
.pill{position:absolute;display:flex;align-items:center;gap:9px;background:#fff;border-radius:999px;padding:10px 18px 10px 12px;font:700 15px Inter,sans-serif;color:${INK};box-shadow:0 18px 36px -14px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.05)}
.pill .d{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${P},${A})}
`;
const bgGlows = (v = 0) => `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;-webkit-mask-image:radial-gradient(ellipse 66% 72% at 50% 50%,#000 45%,transparent 100%);mask-image:radial-gradient(ellipse 66% 72% at 50% 50%,#000 45%,transparent 100%)">
<div class="glow" style="width:620px;height:620px;left:${v ? 560 : -60}px;top:-80px;background:${P};opacity:.22"></div>
<div class="glow" style="width:560px;height:560px;left:${v ? -80 : 640}px;top:420px;background:${A};opacity:.2"></div>
<div class="ring" style="width:880px;height:880px;left:${v ? 40 : 260}px;top:50px;opacity:.55"></div>
<div class="ring" style="width:620px;height:620px;left:${v ? 170 : 390}px;top:180px;opacity:.4"></div>
<div class="dot" style="width:12px;height:12px;left:${v ? 250 : 1200}px;top:130px;opacity:.5"></div>
<div class="dot" style="width:8px;height:8px;left:${v ? 1180 : 120}px;top:790px;background:${A};opacity:.7"></div>
<div class="dot" style="width:16px;height:16px;left:${v ? 1260 : 90}px;top:240px;background:${A};opacity:.45"></div></div>`;
const laptop = (img, x, y, w, rot = "perspective(2400px) rotateY(-12deg) rotateX(5deg) rotateZ(-1deg)") => `
<div class="laptop" style="left:${x}px;top:${y}px;width:${w}px;transform:${rot}">
  <div class="lid"><div class="scr" style="height:${Math.round((w - 28) * 0.625)}px"><span class="cam"></span><img src="${img}"></div></div><div class="base"></div></div>`;
const card = (img, x, y, w, rot, title) => `
<div class="card" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round(w * 0.62) + 30}px;transform:${rot}"><div class="bar"><i></i><i></i><i></i><b>${title}</b></div><img src="${img}"></div>`;
const chip = (x, y, ic, t, s, rot = 0) => `<div class="chip" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)"><span class="ic">${icon(ic, 24)}</span><span><div class="t">${t}</div><div class="s">${s}</div></span></div>`;
const badge = (x, y, ic, rot = -8) => `<div class="badge" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)">${icon(ic, 44, "#fff", 2)}</div>`;
const pill = (x, y, ic, t) => `<div class="pill" style="left:${x}px;top:${y}px"><span class="d">${icon(ic, 15)}</span>${t}</div>`;
const page = (inner) => `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="stage">${inner}</div>`;

/* ───────── compositions ───────── */
const SPECS = {};
/** a product: laptop with its screen, two more screens beside it, what it does as chips */
function panelArt(key, v = 0) {
  const ex = EXTRA[key] ?? [];
  const autos = automationsOf(key);
  const nm = NAMES[key] ?? key;
  const lx = v ? 330 : 90;
  return page(`${bgGlows(v)}
    ${laptop(shot(key), lx, 190, 880, v ? "perspective(2400px) rotateY(11deg) rotateX(5deg) rotateZ(1deg)" : undefined)}
    ${ex[0] ? card(shot(ex[0]), v ? 20 : 930, v ? 560 : 120, 360, `rotate(${v ? -6 : 6}deg)`, nm) : ""}
    ${ex[1] ? card(shot(ex[1]), v ? 1000 : 40, v ? 120 : 590, 340, `rotate(${v ? 5 : -6}deg)`, nm) : ""}
    ${badge(v ? 1180 : 140, v ? 700 : 110, PANEL_ICON[key] ?? "Zap")}
    ${autos[0] ? chip(v ? 40 : 800, v ? 80 : 760, "Zap", "Runs on its own", autos[0], v ? -3 : 3) : ""}
    ${autos[1] ? chip(v ? 760 : 60, v ? 800 : 70, "Check", "Handled for you", autos[1], v ? 2 : -2) : ""}`);
}
for (const k of Object.keys(NAMES)) SPECS[`product-${k}`] = () => panelArt(k, Object.keys(NAMES).indexOf(k) % 2);

SPECS.home = () => page(`${bgGlows(0)}
  ${laptop(shot("workspace"), 150, 150, 940)}
  ${card(shot("fms-invoices"), 880, 70, 380, "rotate(6deg)", "Finance · Invoices")}
  ${card(shot("hrms-employees"), 20, 600, 380, "rotate(-6deg)", "HR & Payroll · Employees")}
  ${card(shot("lms-leads"), 960, 610, 360, "rotate(4deg)", "CRM & Sales · Leads")}
  ${badge(90, 90, "Zap")}
  ${chip(500, 800, "Check", "Deal won", "Client created · team notified — automatically", -2)}
  ${pill(1010, 440, "Brain", "Ask AI in every product")}
  ${pill(60, 420, "Workflow", "20 products · one login")}`);

SPECS.features = () => {
  const keys = ["lms", "hrms", "fms", "pms", "seo"];
  const cards = keys.map((k, i) => card(shot(k), 70 + i * 215, 180 + Math.abs(i - 2) * 38, 440, `perspective(1800px) rotateY(${-22 + i * 11}deg) rotateZ(${-4 + i * 2}deg)`, NAMES[k])).join("");
  return page(`${bgGlows(1)}${cards}
  ${pill(110, 700, "Target", "CRM & Sales")}${pill(420, 800, "Users", "HR & Payroll")}${pill(740, 740, "Wallet", "Finance")}${pill(1050, 680, "Layers", "Projects")}
  ${badge(1170, 90, "Layers")}${chip(60, 70, "Check", "20 products", "Every feature in every plan", -2)}`);
};

SPECS.pricing = () => {
  const plan = (x, y, name, line, dark = false, rot = 0) => `
  <div class="card" style="left:${x}px;top:${y}px;width:300px;height:430px;border-radius:30px;transform:rotate(${rot}deg);${dark ? `background:linear-gradient(160deg,${P},#1e1b6b 70%,#0f766e);color:#fff` : ""}">
    <div style="padding:30px 28px;font-family:Inter,sans-serif">
      <div style="display:flex;align-items:center;gap:12px"><span class="d" style="width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:${dark ? "rgba(255,255,255,.18)" : `linear-gradient(135deg,${P},${A})`}">${icon("Rocket", 24)}</span><b style="font-size:26px;letter-spacing:-.02em">${name}</b></div>
      <div style="margin-top:22px;font-weight:900;font-size:50px;letter-spacing:-.04em">${line}</div>
      <div style="margin-top:22px;display:grid;gap:13px;font-size:16px;font-weight:600;opacity:.92">${["Every product", "Every feature", "Your own brand"].map((t) => `<div style="display:flex;gap:10px;align-items:center"><span style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${dark ? "#fff" : `linear-gradient(135deg,${P},${A})`}">${icon("Check", 13, dark ? P : "#fff", 3.4)}</span>${t}</div>`).join("")}</div>
      <div style="margin-top:26px;height:50px;border-radius:999px;background:${dark ? "#fff" : INK};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:${dark ? INK : "#fff"}">Get started</div>
    </div></div>`;
  return page(`${bgGlows(1)}${plan(110, 330, "Free", "₹0", false, -7)}${plan(430, 230, "Growth", "Best", true, -1)}${plan(760, 330, "Business", "Scale", false, 6)}
  ${chip(930, 90, "Check", "Free forever", "No card needed · every product", 3)}${chip(60, 120, "Zap", "Simple pricing", "The price you see is the price you pay", -3)}${badge(1180, 790, "Rocket", 10)}`);
};
for (const plan of ["free", "starter", "growth", "business", "enterprise"]) {
  SPECS[`plan-${plan}`] = () => SPECS.pricing().replace(/Best<\/div>/, `${plan[0].toUpperCase()}${plan.slice(1)}</div>`);
}

SPECS.about = () => {
  const ks = ["lms", "hrms", "fms", "pms", "prms", "tms", "messenger", "sop", "cms", "seo", "aibots", "dlms"];
  const cx = 700, cy = 490;
  const bub = ks.map((k, i) => {
    const a = (i / ks.length) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 360 : 300;
    const x = cx + Math.cos(a) * r * 1.25 - 38, y = cy + Math.sin(a) * r - 38;
    return `<div class="abs" style="left:${x}px;top:${y}px;width:76px;height:76px;border-radius:24px;background:linear-gradient(135deg,${P},${A});display:flex;align-items:center;justify-content:center;box-shadow:0 22px 40px -14px ${P},0 0 0 6px rgba(255,255,255,.75)">${icon(PANEL_ICON[k], 34)}</div>`;
  }).join("");
  return page(`${bgGlows(0)}
  <div class="ring" style="width:760px;height:620px;left:320px;top:180px;border-radius:50%"></div><div class="ring" style="width:1000px;height:780px;left:200px;top:100px;border-radius:50%"></div>
  ${bub}
  <div class="abs" style="left:${cx - 150}px;top:${cy - 150}px;width:300px;height:300px;border-radius:50%;background:#fff;box-shadow:0 50px 90px -30px ${P},0 0 0 10px rgba(67,56,202,.12);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,sans-serif">
    <div style="width:84px;height:84px;border-radius:26px;background:linear-gradient(135deg,${P},${A});display:flex;align-items:center;justify-content:center">${icon("Zap", 44, "#fff", 2)}</div>
    <b style="margin-top:14px;font-size:30px;letter-spacing:-.03em;color:${INK}">SelfRun AI</b><span style="color:#5b6478;font-weight:600;font-size:17px">20 products · one login</span></div>
  ${card(shot("workspace"), 40, 640, 330, "rotate(-6deg)", "Workspace")}${card(shot("intelligence"), 1010, 90, 330, "rotate(6deg)", "AI Intelligence")}`);
};

SPECS.contact = () => page(`${bgGlows(1)}
  ${laptop(shot("support"), 300, 190, 860, "perspective(2400px) rotateY(10deg) rotateX(4deg) rotateZ(1deg)")}
  ${chip(30, 110, "MessageSquare", "Sales and demos", "Plans, pricing and a walkthrough", -3)}
  ${chip(60, 450, "Lock", "Security", "Report a vulnerability or ask a question", 2)}
  ${chip(900, 800, "Check", "Reply within one business day", "From the people who build it", -2)}
  ${badge(1200, 100, "MessageSquare", 10)}${card(shot("workspace"), 20, 690, 320, "rotate(-5deg)", "Workspace")}`);

SPECS.demo = () => page(`${bgGlows(0)}
  ${laptop(shot("workspace"), 180, 170, 900)}
  <div class="abs" style="left:560px;top:430px;width:130px;height:130px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 40px 70px -20px rgba(15,23,42,.55),0 0 0 14px rgba(255,255,255,.35)">${icon("Play", 56, P, 2.4).replace("<svg", '<svg style="margin-left:6px;fill:' + P + '"')}</div>
  ${chip(870, 90, "Clock", "30-minute walkthrough", "Built around your own scenarios", 3)}
  ${chip(30, 640, "Target", "Your processes", "Mapped on the real product", -3)}
  ${card(shot("lms-leads"), 940, 640, 350, "rotate(5deg)", "CRM & Sales · Leads")}${badge(90, 130, "Rocket")}`);

SPECS.docs = () => page(`${bgGlows(1)}
  ${laptop(shot("hrms-employees"), 310, 200, 860, "perspective(2400px) rotateY(9deg) rotateX(4deg)")}
  ${["Open the product", "Click Employees", "Fill the form"].map((t, i) => `<div class="pill" style="left:${[60, 40, 120][i]}px;top:${[180, 400, 620][i]}px;font-size:18px;padding:14px 24px 14px 14px"><span class="d" style="width:34px;height:34px;font-weight:900;color:#fff;font-size:17px">${i + 1}</span>${t}</div>`).join("")}
  ${chip(840, 790, "BookOpen", "Step by step", "With the real screen", -2)}${badge(1190, 110, "BookOpen")}${card(shot("fms-invoices"), 1000, 600, 330, "rotate(5deg)", "Finance · Invoices")}`);

SPECS.gallery = () => {
  const ks = ["workspace", "lms", "hrms", "fms", "pms", "seo", "cms", "tms", "sop"];
  const tiles = ks.map((k, i) => card(shot(k), 120 + (i % 3) * 390 + (Math.floor(i / 3) % 2) * 40, 90 + Math.floor(i / 3) * 290, 360, `perspective(2000px) rotateY(-16deg) rotateX(4deg) rotateZ(-3deg)`, NAMES[k])).join("");
  return page(`${bgGlows(1)}${tiles}${chip(30, 800, "Check", "Real screens", "Captured from the live product", -2)}${badge(1210, 90, "Layers", 8)}`);
};

SPECS.login = () => page(`${bgGlows(0)}
  ${laptop(shot("workspace"), 200, 190, 880)}
  <div class="card" style="left:80px;top:520px;width:400px;height:300px;border-radius:28px;transform:rotate(-4deg);padding:30px;font-family:Inter,sans-serif"><div style="font-weight:900;font-size:26px;color:${INK};letter-spacing:-.02em">Your workspace</div><div style="margin-top:18px;border:2px solid #e4e7f0;border-radius:16px;height:56px;display:flex;align-items:center;padding:0 18px;color:#9aa1b2;font-size:18px">yourcompany</div><div style="margin-top:16px;height:56px;border-radius:999px;background:${INK};color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center">Continue to sign in</div></div>
  ${chip(860, 100, "Lock", "Your company's workspace", "Your own address, your own data", 3)}${badge(1200, 760, "Lock", 10)}`);

SPECS.legal = () => page(`${bgGlows(1)}
  ${laptop(shot("dlms"), 300, 200, 860, "perspective(2400px) rotateY(10deg) rotateX(4deg)")}
  ${chip(40, 130, "Lock", "Encrypted at rest", "Credentials and vault documents", -3)}
  ${chip(60, 560, "Shield", "Isolated per company", "Every query is confined to its company", 2)}
  ${chip(860, 790, "Check", "Yours to export", "Records and CSV import any time", -2)}${badge(1190, 100, "Shield")}`);


/* ───────── hero backgrounds ───────── */
const BW = 1920, BH = 820;
const bgCss = (dark) => `
html,body{width:${BW}px;height:${BH}px}
.bgs{position:relative;width:${BW}px;height:${BH}px;overflow:hidden;
 background:${dark
  ? "radial-gradient(1100px 650px at 86% 18%,rgba(124,117,245,.30),transparent 62%),radial-gradient(900px 620px at 96% 96%,rgba(16,185,129,.20),transparent 62%),radial-gradient(900px 520px at 4% -6%,rgba(124,117,245,.12),transparent 60%),linear-gradient(180deg,#0d1226,#0b1020)"
  : "radial-gradient(1100px 650px at 86% 18%,rgba(67,56,202,.17),transparent 62%),radial-gradient(900px 620px at 96% 96%,rgba(16,185,129,.17),transparent 62%),radial-gradient(900px 520px at 4% -6%,rgba(67,56,202,.07),transparent 60%),radial-gradient(700px 420px at 40% 110%,rgba(16,185,129,.06),transparent 60%),linear-gradient(180deg,#f9faff,#f2f4fc)"}}
.motif{position:absolute;inset:0;opacity:${dark ? ".6" : ".6"};transform:perspective(2400px) rotateY(-9deg) rotateX(3deg) scale(1.04);transform-origin:78% 50%;-webkit-mask-image:linear-gradient(90deg,transparent 0%,transparent 30%,#000 62%);mask-image:linear-gradient(90deg,transparent 0%,transparent 30%,#000 62%)}
.mc{position:absolute;background:${dark ? "rgba(30,36,74,.72)" : "rgba(255,255,255,.72)"};border:1.5px solid ${dark ? "rgba(140,132,255,.28)" : "rgba(67,56,202,.16)"};border-radius:20px;box-shadow:0 30px 60px -28px ${dark ? "rgba(0,0,0,.7)" : "rgba(67,56,202,.32)"}}
.mc.hi{border-color:rgba(16,185,129,.6);background:${dark ? "rgba(22,52,60,.8)" : "rgba(255,255,255,.9)"}}
.mb{position:absolute;display:block;border-radius:8px;background:${dark ? "rgba(150,142,255,.35)" : "rgba(67,56,202,.2)"}}
.mb.g{background:${dark ? "rgba(52,211,153,.55)" : "rgba(16,185,129,.4)"}}.mb.d{background:${dark ? "rgba(170,163,255,.7)" : "rgba(67,56,202,.45)"}}
.mo{position:absolute;border-radius:50%;background:linear-gradient(135deg,#4338ca,#10b981);opacity:.78}
.mo.s{opacity:${dark ? ".5" : ".28"};background:${dark ? "rgba(150,142,255,.8)" : "rgba(67,56,202,.5)"}}
.dash{position:absolute;border-top:3px dotted ${dark ? "rgba(150,142,255,.5)" : "rgba(67,56,202,.35)"}}
.gl{position:absolute;opacity:.2}
`;
const mx = (x, y, w, h, c = "", r = 20) => `<div class="mc ${c}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}px"></div>`;
const mbar = (x, y, w, c = "", h = 12) => `<i class="mb ${c}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></i>`;
const mdot = (x, y, d, c = "") => `<i class="mo ${c}" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px"></i>`;
const mdash = (x, y, w, rot = 0) => `<i class="dash" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);transform-origin:0 0"></i>`;
const mico = (name, x, y, size, op = 0.16) => `<div class="gl" style="left:${x}px;top:${y}px;opacity:${op}">${icon(name, size, P, 1.4)}</div>`;
const msvg = (inner) => `<svg class="motif-svg" style="position:absolute;left:0;top:0" width="${BW}" height="${BH}" viewBox="0 0 ${BW} ${BH}" fill="none">${inner}</svg>`;
const pth = (d, c = P, w = 4, op = 0.45) => `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

const MOTIFS = {
  kanban: () => [0, 1, 2, 3].map((c) => mx(1000 + c * 250, 90, 225, 600, c === 2 ? "hi" : "") + mbar(1020 + c * 250, 118, 110, "d") + [0, 1, 2, 3].slice(0, 4 - (c % 2)).map((r) => mx(1018 + c * 250, 170 + r * 130, 189, 105 - ((r + c) % 2) * 10) + mbar(1034 + c * 250, 192 + r * 130, 120) + mbar(1034 + c * 250, 216 + r * 130, 80, "g") + mdot(1170 + c * 250, 188 + r * 130, 22, "s")).join("")).join("") + msvg(pth("M1235 400 C1265 400 1250 300 1280 300", A, 4, 0.6) + pth("M1485 330 C1515 330 1500 470 1530 470", A, 4, 0.6)),
  org: () => { const top = mx(1380, 70, 200, 90, "hi") + mdot(1398, 90, 50); const mid = [0, 1, 2].map((i) => mx(1110 + i * 330, 260, 200, 90) + mdot(1128 + i * 330, 280, 50)).join(""); const leaf = [0, 1, 2, 3, 4, 5].map((i) => mx(980 + i * 160, 470, 140, 150) + mdot(1020 + i * 160, 490, 60) + mbar(1000 + i * 160, 570, 100) + mbar(1000 + i * 160, 592, 60, "g")).join(""); return top + mid + leaf + msvg(pth("M1480 160 V210 M1210 210 H1870 M1210 210 V260 M1540 210 V260 M1870 210 V260", P, 3, 0.4) + [0, 1, 2].map((i) => pth(`M${1210 + i * 330} 350 V420 M${1060 + i * 320} 420 H${1180 + i * 320} M${1060 + i * 320} 420 V470 M${1180 + i * 320} 420 V470`, P, 3, 0.35)).join("")); },
  finance: () => mx(980, 80, 560, 360) + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<i class="mb ${i === 5 ? "g" : "d"}" style="left:${1020 + i * 62}px;top:${380 - [90, 150, 120, 210, 170, 260, 190, 230][i]}px;width:38px;height:${[90, 150, 120, 210, 170, 260, 190, 230][i]}px;opacity:${i === 5 ? 0.9 : 0.55}"></i>`).join("") + mx(1580, 80, 280, 360, "hi") + mdot(1640, 130, 130) + mbar(1610, 300, 200) + mbar(1610, 330, 140, "g") + mx(980, 480, 880, 230) + [0, 1, 2, 3].map((r) => mbar(1010, 515 + r * 50, 300 + (r % 2) * 140) + mbar(1700, 515 + r * 50, 120, "g")).join("") + msvg(pth("M1020 330 C1120 280 1180 340 1280 250 S1450 200 1510 130", A, 5, 0.75)) + mico("Wallet", 1700, 560, 110, 0.2),
  gantt: () => mx(980, 80, 880, 640) + [0, 1, 2, 3, 4, 5, 6].map((i) => mbar(1010, 130 + i * 84, 150) + `<i class="mb ${i % 3 === 1 ? "g" : "d"}" style="left:${1200 + i * 62}px;top:${124 + i * 84}px;width:${280 + ((i * 97) % 200)}px;height:30px;border-radius:15px;opacity:.55"></i>`).join("") + [1, 3, 5].map((i) => mdot(1560 + i * 40, 128 + i * 84, 24)).join("") + msvg(pth("M1460 160 C1500 160 1480 244 1520 244 M1620 328 C1660 328 1640 412 1680 412", A, 3, 0.5)),
  procure: () => [0, 1, 2, 3].map((i) => mx(980 + i * 235, 250, 190, 190, i === 2 ? "hi" : "") + mdot(1030 + i * 235, 290, 90) + mbar(1010 + i * 235, 410, 130)).join("") + [0, 1, 2].map((i) => mdash(1172 + i * 235, 345, 44)).join("") + mx(980, 520, 900, 210) + [0, 1, 2].map((r) => mbar(1010, 555 + r * 55, 420) + mbar(1700, 555 + r * 55, 120, "g")).join("") + mico("ShoppingCart", 1100, 70, 120, 0.18),
  learn: () => mx(980, 80, 560, 430) + Array.from({ length: 25 }, (_, i) => `<i class="mb ${i % 7 === 3 ? "g" : ""}" style="left:${1010 + (i % 5) * 100}px;top:${120 + Math.floor(i / 5) * 76}px;width:82px;height:58px;border-radius:12px;opacity:${i % 7 === 3 ? 0.8 : 0.25}"></i>`).join("") + mx(1580, 80, 290, 430, "hi") + mdot(1650, 130, 150) + mbar(1610, 330, 230) + mbar(1610, 365, 160, "g") + mx(980, 560, 890, 160) + [0, 1, 2].map((i) => mdot(1010 + i * 180, 590, 100, "s") + mbar(1130 + i * 180, 615, 40)).join("") + mico("GraduationCap", 1700, 560, 130, 0.22),
  chat: () => mx(980, 80, 300, 640) + [0, 1, 2, 3, 4].map((i) => mdot(1000, 120 + i * 112, 56, i === 1 ? "" : "s") + mbar(1070, 132 + i * 112, 170) + mbar(1070, 160 + i * 112, 110, "g")).join("") + [0, 1, 2, 3].map((i) => `<div class="mc ${i % 2 ? "hi" : ""}" style="left:${i % 2 ? 1480 : 1330}px;top:${110 + i * 150}px;width:${300 + (i % 3) * 30}px;height:100px;border-radius:${i % 2 ? "28px 28px 8px 28px" : "28px 28px 28px 8px"}"></div>` + mbar((i % 2 ? 1510 : 1360), 140 + i * 150, 220) + mbar((i % 2 ? 1510 : 1360), 172 + i * 150, 150, "g")).join(""),
  docs: () => [0, 1, 2].map((i) => mx(1060 + i * 190, 120 + i * 45, 440, 560 - i * 20, i === 2 ? "hi" : "") + (i === 2 ? mbar(1470, 170, 240, "d") + [0, 1, 2, 3, 4, 5].map((r) => mdot(1440, 240 + r * 70, 30) + mbar(1490, 248 + r * 70, 250 - (r % 3) * 40)).join("") : "")).join("") + msvg(pth("M1460 640 C1500 590 1520 690 1560 640 S1630 600 1670 640", A, 5, 0.7)) + mico("FileText", 1000, 560, 120, 0.2),
  vault: () => mx(1060, 100, 760, 620, "hi") + [0, 1, 2, 3, 4, 5].map((i) => mx(1100 + (i % 3) * 235, 150 + Math.floor(i / 3) * 240, 205, 200) + mdot(1170 + (i % 3) * 235, 190 + Math.floor(i / 3) * 240, 64) + mbar(1130 + (i % 3) * 235, 300 + Math.floor(i / 3) * 240, 140) + mbar(1130 + (i % 3) * 235, 326 + Math.floor(i / 3) * 240, 90, "g")).join("") + mico("Lock", 1700, 70, 170, 0.2),
  quiz: () => mx(980, 80, 600, 640) + mbar(1020, 120, 300, "d", 16) + [0, 1, 2, 3].map((i) => mdot(1020, 200 + i * 120, 34, i === 1 ? "" : "s") + mx(1075, 190 + i * 120, 440, 60, i === 1 ? "hi" : "", 14) + mbar(1100, 213 + i * 120, 260 - i * 20)).join("") + mx(1620, 80, 250, 320, "hi") + mdot(1650, 130, 190) + mx(1620, 440, 250, 280) + [0, 1, 2].map((i) => mbar(1650, 480 + i * 60, 190 - i * 30, i === 1 ? "g" : "")).join(""),
  ai: () => { const nodes = [[1050, 150], [1050, 380], [1050, 610], [1330, 90], [1330, 290], [1330, 490], [1330, 690], [1610, 190], [1610, 420], [1610, 650], [1820, 400]]; const edges = [[0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9], [7, 10], [8, 10], [9, 10]]; return msvg(edges.map(([a, b]) => pth(`M${nodes[a][0] + 30} ${nodes[a][1] + 30} L${nodes[b][0] + 30} ${nodes[b][1] + 30}`, P, 3, 0.28)).join("")) + nodes.map(([x, y], i) => mdot(x, y, i === 10 ? 80 : 60, i % 3 === 1 ? "" : "s")).join("") + mx(1100, 730, 640, 70, "hi", 35) + mico("Brain", 1680, 40, 150, 0.2); },
  social: () => [0, 1, 2].map((i) => mx(1000 + i * 290, 100 + (i % 2) * 70, 260, 400) + `<i class="mb ${i === 1 ? "g" : ""}" style="left:${1020 + i * 290}px;top:${200 + (i % 2) * 70}px;width:220px;height:180px;border-radius:14px;opacity:.5"></i>` + mdot(1020 + i * 290, 125 + (i % 2) * 70, 50) + mbar(1085 + i * 290, 140 + (i % 2) * 70, 120) + mbar(1020 + i * 290, 410 + (i % 2) * 70, 200) + mbar(1020 + i * 290, 440 + (i % 2) * 70, 130, "g")).join("") + mx(1000, 580, 870, 150) + Array.from({ length: 14 }, (_, i) => `<i class="mb ${i % 5 === 2 ? "g" : ""}" style="left:${1030 + i * 60}px;top:${615 + (i % 2) * 44}px;width:44px;height:30px;border-radius:8px;opacity:${i % 5 === 2 ? 0.8 : 0.3}"></i>`).join("") + mico("Megaphone", 1740, 40, 140, 0.2),
  seo: () => mx(980, 80, 900, 380) + msvg(pth("M1020 410 C1120 380 1180 400 1280 320 S1440 260 1520 220 S1700 150 1840 120", A, 6, 0.8) + pth("M1020 430 C1140 420 1200 410 1320 370 S1500 330 1620 300 S1780 260 1840 240", P, 4, 0.4)) + mx(980, 500, 600, 220) + [0, 1, 2, 3].map((i) => mdot(1010, 530 + i * 46, 30, i === 0 ? "" : "s") + mbar(1060, 538 + i * 46, 280 - i * 30) + mbar(1480, 538 + i * 46, 60, "g")).join("") + mx(1620, 500, 260, 220, "hi") + mdot(1680, 540, 120) + mico("Search", 1100, 100, 140, 0.18),
  site: () => mx(980, 80, 900, 640) + `<div class="mc" style="left:980px;top:80px;width:900px;height:46px;border-radius:20px 20px 0 0"></div>` + [0, 1, 2].map((i) => mdot(1005 + i * 26, 96, 14, "s")).join("") + `<i class="mb d" style="left:1010px;top:160px;width:840px;height:200px;border-radius:16px;opacity:.28"></i>` + mbar(1050, 200, 360, "d", 22) + mbar(1050, 245, 260, "", 14) + mbar(1050, 290, 140, "g", 34) + [0, 1, 2].map((i) => mx(1010 + i * 285, 400, 262, 290, i === 1 ? "hi" : "") + mbar(1030 + i * 285, 420, 222, "", 120) + mbar(1030 + i * 285, 560, 160) + mbar(1030 + i * 285, 590, 100, "g")).join(""),
  people: () => [0, 1, 2, 3, 4, 5].map((i) => mx(1000 + (i % 3) * 290, 110 + Math.floor(i / 3) * 310, 262, 270, i === 4 ? "hi" : "") + mdot(1085 + (i % 3) * 290, 140 + Math.floor(i / 3) * 310, 90, i === 4 ? "" : "s") + mbar(1040 + (i % 3) * 290, 260 + Math.floor(i / 3) * 310, 180) + mbar(1040 + (i % 3) * 290, 292 + Math.floor(i / 3) * 310, 120, "g") + mbar(1040 + (i % 3) * 290, 330 + Math.floor(i / 3) * 310, 180, "", 28)).join("") + mico("Building2", 1760, 40, 140, 0.2),
  support: () => [0, 1, 2].map((i) => mx(1000, 100 + i * 190, 560, 160, i === 0 ? "hi" : "") + mdot(1030, 135 + i * 190, 60, i ? "s" : "") + mbar(1110, 140 + i * 190, 300, "d") + mbar(1110, 175 + i * 190, 400) + mbar(1110, 205 + i * 190, 200, "g")).join("") + mx(1620, 140, 250, 520, "hi") + [0, 1, 2, 3].map((i) => `<div class="mc" style="left:${1640 + (i % 2) * 40}px;top:${170 + i * 115}px;width:200px;height:84px;border-radius:24px ${i % 2 ? "8px" : "24px"} 24px ${i % 2 ? "24px" : "8px"}"></div>`).join("") + mico("MessageSquare", 1640, 600, 120, 0.2),
  workspace: () => { const ks = Object.keys(PANEL_ICON); return ks.slice(0, 20).map((k, i) => mx(980 + (i % 5) * 180, 90 + Math.floor(i / 5) * 175, 150, 150, i === 7 ? "hi" : "", 26) + `<div class="gl" style="left:${1020 + (i % 5) * 180}px;top:${120 + Math.floor(i / 5) * 175}px;opacity:${i === 7 ? 0.8 : 0.4}">${icon(PANEL_ICON[k], 70, i === 7 ? A : P, 1.5)}</div>` + mbar(1005 + (i % 5) * 180, 205 + Math.floor(i / 5) * 175, 100)).join("") + msvg(pth("M1055 165 H1235 M1415 165 V340 M1235 340 H1595 M1775 515 H1415", A, 3, 0.4)); },
  pricing: () => [0, 1, 2].map((i) => mx(1010 + i * 285, 120 + (i === 1 ? 0 : 60), 262, i === 1 ? 560 : 500, i === 1 ? "hi" : "") + mdot(1040 + i * 285, 160 + (i === 1 ? 0 : 60), 70, i === 1 ? "" : "s") + mbar(1040 + i * 285, 260 + (i === 1 ? 0 : 60), 180, "d", 26) + [0, 1, 2, 3].map((r) => mdot(1040 + i * 285, 330 + r * 60 + (i === 1 ? 0 : 60), 24) + mbar(1080 + i * 285, 336 + r * 60 + (i === 1 ? 0 : 60), 140)).join("") + mbar(1040 + i * 285, 600 + (i === 1 ? 0 : 20), 200, i === 1 ? "g" : "d", 40)).join("") + mico("Wallet", 1700, 40, 150, 0.2),
  orbit: () => msvg(`<ellipse cx="1500" cy="410" rx="470" ry="330" stroke="${P}" stroke-width="3" stroke-dasharray="10 12" opacity=".3"/><ellipse cx="1500" cy="410" rx="300" ry="210" stroke="${P}" stroke-width="3" stroke-dasharray="10 12" opacity=".25"/>`) + mdot(1430, 340, 140) + Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2, rx = i % 2 ? 470 : 300, ry = i % 2 ? 330 : 210; return mx(1500 + Math.cos(a) * rx - 40, 410 + Math.sin(a) * ry - 40, 80, 80, i === 3 ? "hi" : "", 26); }).join("") + mico("Zap", 1458, 366, 84, 0.9),
  contact: () => mx(980, 100, 480, 300, "hi", 30) + mbar(1020, 140, 260, "d", 16) + mbar(1020, 185, 380) + mbar(1020, 215, 320) + mbar(1020, 245, 200, "g") + `<div class="mc" style="left:1500px;top:130px;width:360px;height:130px;border-radius:30px 30px 30px 8px"></div>` + mbar(1530, 165, 250) + mbar(1530, 195, 160, "g") + `<div class="mc hi" style="left:1360px;top:300px;width:420px;height:130px;border-radius:30px 30px 8px 30px"></div>` + mbar(1390, 335, 300) + mbar(1390, 365, 200, "g") + mx(980, 460, 340, 250) + mx(1360, 480, 500, 230) + mdot(1010, 490, 80) + mdot(1400, 510, 70, "s") + mico("MessageSquare", 1700, 540, 140, 0.2),
  demo: () => mx(980, 90, 880, 520) + `<div class="mo" style="left:1330px;top:260px;width:180px;height:180px;opacity:.85"></div>` + msvg(`<path d="M1400 320 L1470 350 L1400 380 Z" fill="#fff"/>`) + mx(980, 650, 880, 100) + [0, 1, 2, 3, 4, 5].map((i) => `<i class="mb ${i === 2 ? "g" : ""}" style="left:${1010 + i * 140}px;top:680px;width:110px;height:40px;border-radius:12px;opacity:${i === 2 ? 0.85 : 0.3}"></i>`).join(""),
  gallery: () => Array.from({ length: 9 }, (_, i) => `<div class="mc ${i === 4 ? "hi" : ""}" style="left:${980 + (i % 3) * 300 + (Math.floor(i / 3) % 2) * 40}px;top:${90 + Math.floor(i / 3) * 230}px;width:270px;height:200px;border-radius:18px"></div>` + `<i class="mb ${i % 4 === 1 ? "g" : "d"}" style="left:${1000 + (i % 3) * 300 + (Math.floor(i / 3) % 2) * 40}px;top:${135 + Math.floor(i / 3) * 230}px;width:${150 + (i % 3) * 30}px;height:14px;opacity:.4"></i>` + mdot(1000 + (i % 3) * 300 + (Math.floor(i / 3) % 2) * 40, 108 + Math.floor(i / 3) * 230, 14, "s")).join(""),
  shield: () => mx(1040, 90, 780, 640, "hi") + mdot(1370, 150, 160) + msvg(pth("M1420 220 l40 40 l80 -80", "#fff", 14, 0.95)) + [0, 1, 2, 3].map((i) => mdot(1100, 370 + i * 80, 34) + mbar(1160, 380 + i * 80, 420 - i * 40)).join("") + mico("Shield", 1690, 520, 150, 0.2),
};
const BG_KIND = { home: "workspace", features: "workspace", pricing: "pricing", about: "orbit", contact: "contact", demo: "demo", docs: "docs", gallery: "gallery", login: "vault", legal: "shield", "panel-workspace": "workspace", "panel-lms": "kanban", "panel-hrms": "org", "panel-fms": "finance", "panel-pms": "gantt", "panel-prms": "procure", "panel-tms": "learn", "panel-messenger": "chat", "panel-sop": "docs", "panel-lpms": "docs", "panel-dlms": "vault", "panel-ots": "quiz", "panel-aibots": "ai", "panel-intelligence": "ai", "panel-smms": "social", "panel-seo": "seo", "panel-cms": "site", "panel-website": "site", "panel-portal": "people", "panel-support": "support" };
for (const plan of ["free", "starter", "growth", "business", "enterprise"]) BG_KIND[`plan-${plan}`] = "pricing";
const BGS = {};
for (const [id, kind] of Object.entries(BG_KIND)) for (const dark of [false, true]) BGS[`bg-${id}${dark ? "-dark" : ""}`] = () => `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${bgCss(dark)}</style><div class="bgs"><div class="motif">${MOTIFS[kind]()}</div></div>`;

/* ───────── render ───────── */
const wanted = process.argv.slice(2);
const ALL = { ...SPECS, ...BGS };
const ids = Object.keys(ALL).filter((id) => !wanted.length || wanted.includes(id) || (wanted.includes("bg") && id.startsWith("bg-")) || (wanted.includes("art") && !id.startsWith("bg-")));
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9371;
const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, "prof")}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const key of ids) {
  const isBg = key.startsWith("bg-");
  await send("Emulation.setDeviceMetricsOverride", isBg ? { width: BW, height: BH, deviceScaleFactor: 1, mobile: false } : { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  const file = path.join(TMP, `${key}.html`);
  fs.writeFileSync(file, ALL[key]());
  await send("Page.navigate", { url: `file://${file}` });
  await sleep(1800);
  const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const png = path.join(TMP, `${key}.png`);
  fs.writeFileSync(png, Buffer.from(shotRes.result.data, "base64"));
  execFileSync("python3", ["-I", "-c", "import sys;from PIL import Image;im=Image.open(sys.argv[1]);bg=sys.argv[2].split('/')[-1].startswith('bg-');im=im.convert('RGB' if bg else 'RGBA');im.save(sys.argv[2],'WEBP',quality=80 if bg else 84,method=6)", png, path.join(OUT, `${key}.webp`)]);
  console.log("hero", key);
}
ws.close(); chrome.kill();
fs.rmSync(TMP, { recursive: true, force: true });
