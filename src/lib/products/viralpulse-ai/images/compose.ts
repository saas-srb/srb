import "server-only";
import path from "node:path";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import { safeBox, type ImageSpec } from "@/lib/products/viralpulse-ai/images/specs";
import { hasDevanagari } from "@/lib/products/viralpulse-ai/images/policy";
import type { LogoPlacement, TextPosition } from "@/lib/products/viralpulse-ai/images/types";

/**
 * Turns what the model drew into what a platform wants: crop and resize to the exact size, the person's own words drawn on top with a
 * bundled font (the model is never trusted to spell), the brand logo, an optional visible "AI generated" badge, and metadata that
 * marks the file as AI generated. Everything here runs locally with sharp (libvips); no network.
 *
 * Fonts: Noto Sans and Noto Sans Devanagari (SIL OFL 1.1, bundled in ./fonts, see LICENSE-FONTS.txt) are loaded by file with
 * Pango's `fontfile` option, so the result does not depend on which fonts the server has installed (serverless hosts have none).
 */

export const FONT_DIR = process.env.IMAGE_FONT_DIR || path.join(process.cwd(), "src/lib/products/viralpulse-ai/images/fonts");
const FONTS = {
  latin: { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf", family: "Noto Sans" },
  devanagari: { regular: "NotoSansDevanagari-Regular.ttf", bold: "NotoSansDevanagari-Bold.ttf", family: "Noto Sans Devanagari" },
};
export const fontFor = (text: string, weight: "regular" | "bold") => {
  const f = hasDevanagari(text) ? FONTS.devanagari : FONTS.latin;
  return { file: path.join(FONT_DIR, f[weight]), family: weight === "bold" ? `${f.family} Bold` : f.family };
};

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
import { isHex, normHex } from "@/lib/products/viralpulse-ai/images/color";

function luminance(hex: string): number {
  const c = normHex(hex).slice(1).match(/../g)!.map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface TextLayer {
  value: string;
  position: TextPosition;
  /** A brand text colour; when absent, white or near-black is chosen from the picture underneath. */
  color?: string;
  align?: "left" | "center";
  weight?: "regular" | "bold";
}

export interface RenderedText {
  buf: Buffer;
  width: number;
  height: number;
  size: number;
  fitted: boolean;
}

/** Draws `text` (Pango, with shaping for Devanagari) shrinking the size until it fits the box. */
export async function renderText(text: string, box: { width: number; height: number }, opts: { color: string; weight: "regular" | "bold"; align: "left" | "center"; startSize: number; minSize?: number }): Promise<RenderedText> {
  const f = fontFor(text, opts.weight);
  const min = Math.max(10, Math.round(opts.minSize ?? 14));
  let size = Math.max(min, Math.round(opts.startSize));
  for (;;) {
    const buf = await sharp({ text: { text: `<span foreground="${opts.color}">${xml(text)}</span>`, font: `${f.family} ${size}`, fontfile: f.file, width: box.width, rgba: true, align: opts.align === "center" ? "centre" : "left", dpi: 72, spacing: Math.round(size * 0.18), wrap: "word-char" } }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if ((h <= box.height && w <= box.width) || size <= min) return { buf, width: w, height: h, size, fitted: h <= box.height && w <= box.width };
    size = Math.max(min, Math.floor(size * 0.9));
  }
}

const logoPos = (placement: LogoPlacement, box: { left: number; top: number; width: number; height: number }, w: number, h: number) => {
  const x = placement === "tl" || placement === "bl" ? box.left : placement === "bc" ? box.left + Math.round((box.width - w) / 2) : box.left + box.width - w;
  const y = placement === "tl" || placement === "tr" ? box.top : box.top + box.height - h;
  return { left: Math.max(0, x), top: Math.max(0, y) };
};

export interface ComposeOptions {
  spec: Pick<ImageSpec, "width" | "height" | "safe" | "formats" | "maxBytes">;
  source: Buffer;
  focus?: "centre" | "attention" | "top" | "bottom" | "left" | "right";
  text?: TextLayer;
  logo?: { data: Buffer; placement: LogoPlacement; scale: number };
  badge?: boolean;
  format?: "jpeg" | "png";
  meta?: { description: string; aiGenerated: boolean };
}

export interface ComposeResult {
  data: Buffer;
  contentType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  warnings: string[];
  /** Where the text landed (pixels), for tests and previews. */
  textRect: { left: number; top: number; width: number; height: number } | null;
}

const IPTC_AI = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
export function xmpPacket(meta: { description: string; aiGenerated: boolean }): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(meta.description.slice(0, 500))}</rdf:li></rdf:Alt></dc:description><xmp:CreatorTool>SelfRun ViralPulse AI Image Studio</xmp:CreatorTool>${meta.aiGenerated ? `<Iptc4xmpExt:DigitalSourceType>${IPTC_AI}</Iptc4xmpExt:DigitalSourceType>` : ""}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}

/** The whole pipeline for one destination size. */
export async function composeExport(o: ComposeOptions): Promise<ComposeResult> {
  const { width: W, height: H } = o.spec;
  const warnings: string[] = [];
  const base = await sharp(o.source, { failOn: "none", limitInputPixels: 120_000_000 }).rotate().resize(W, H, { fit: "cover", position: o.focus ?? "centre", kernel: "lanczos3" }).flatten({ background: "#ffffff" }).toColourspace("srgb").png().toBuffer();
  const box = safeBox(o.spec);
  const layers: OverlayOptions[] = [];
  let textRect: ComposeResult["textRect"] = null;

  if (o.text?.value.trim()) {
    const t = o.text;
    const weight = t.weight ?? "bold";
    const align = t.align ?? "center";
    const startSize = Math.min(box.height * 0.5, W * (box.width / W < 0.5 ? 0.09 : 0.075));
    // Rough first pass to learn where the text will sit, so the colour can be chosen from the picture under it.
    const probe = await renderText(t.value, { width: box.width, height: Math.round(box.height * 0.6) }, { color: "#ffffff", weight, align, startSize });
    const top = t.position === "top" ? box.top : t.position === "middle" ? box.top + Math.round((box.height - probe.height) / 2) : box.top + box.height - probe.height;
    const left = align === "center" ? box.left + Math.round((box.width - probe.width) / 2) : box.left;
    const region = await sharp(base).extract({ left: Math.max(0, left), top: Math.max(0, top), width: Math.max(1, Math.min(probe.width, W - left)), height: Math.max(1, Math.min(probe.height, H - top)) }).stats();
    const mean = "#" + region.channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, "0")).join("");
    let color = t.color && isHex(t.color) ? normHex(t.color) : contrastRatio("#ffffff", mean) >= contrastRatio("#111111", mean) ? "#ffffff" : "#111111";
    // The scrim is drawn when the colour would be hard to read on its own.
    const needsScrim = contrastRatio(color, mean) < 4.5;
    if (needsScrim) {
      const dark = luminance(color) > 0.4;
      const pad = Math.round(probe.height * 0.35 + H * 0.02);
      const y0 = Math.max(0, top - pad);
      const y1 = Math.min(H, top + probe.height + pad);
      const rgb = dark ? "0,0,0" : "255,255,255";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(${rgb})" stop-opacity="0"/><stop offset="0.3" stop-color="rgb(${rgb})" stop-opacity="0.62"/><stop offset="0.7" stop-color="rgb(${rgb})" stop-opacity="0.62"/><stop offset="1" stop-color="rgb(${rgb})" stop-opacity="0"/></linearGradient></defs><rect x="0" y="${y0}" width="${W}" height="${Math.max(1, y1 - y0)}" fill="url(#g)"/></svg>`;
      layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
      if (t.color && isHex(t.color) && contrastRatio(color, dark ? "#000000" : "#ffffff") < 4.5) color = dark ? "#ffffff" : "#111111";
    }
    const final = await renderText(t.value, { width: box.width, height: Math.round(box.height * 0.6) }, { color, weight, align, startSize });
    if (!final.fitted) warnings.push("The text is too long to stay inside the safe zone at a readable size. Shorten it.");
    const fTop = t.position === "top" ? box.top : t.position === "middle" ? box.top + Math.round((box.height - final.height) / 2) : box.top + box.height - final.height;
    const fLeft = align === "center" ? box.left + Math.round((box.width - final.width) / 2) : box.left;
    const tl = Math.max(0, fLeft);
    const tt = Math.max(0, fTop);
    const cw = Math.max(1, Math.min(final.width, W - tl));
    const ch = Math.max(1, Math.min(final.height, H - tt));
    // Text that cannot fit is clipped to the picture (and reported above) rather than failing the export.
    const textBuf = cw < final.width || ch < final.height ? await sharp(final.buf).extract({ left: 0, top: 0, width: cw, height: ch }).png().toBuffer() : final.buf;
    layers.push({ input: textBuf, left: tl, top: tt });
    textRect = { left: tl, top: tt, width: cw, height: ch };
  }

  let logoRect: { left: number; top: number; width: number; height: number } | null = null;
  if (o.logo) {
    const maxW = Math.max(16, Math.round(W * Math.min(Math.max(o.logo.scale, 0.04), 0.4)));
    const maxH = Math.round(H * 0.25);
    const lb = await sharp(o.logo.data, { failOn: "none" }).resize({ width: maxW, height: maxH, fit: "inside", withoutEnlargement: false }).png().toBuffer();
    const lm = await sharp(lb).metadata();
    const pos = logoPos(o.logo.placement, box, lm.width ?? maxW, lm.height ?? maxH);
    layers.push({ input: lb, ...pos });
    logoRect = { ...pos, width: lm.width ?? 0, height: lm.height ?? 0 };
    if (textRect && overlaps(textRect, logoRect)) warnings.push("The logo overlaps the text. Move the logo or the text.");
  }

  if (o.badge) {
    const size = Math.max(14, Math.round(W * 0.02));
    const label = await renderText("AI generated", { width: Math.round(W * 0.4), height: size * 3 }, { color: "#ffffff", weight: "bold", align: "left", startSize: size, minSize: size });
    const padX = Math.round(size * 0.7);
    const padY = Math.round(size * 0.4);
    const pw = label.width + padX * 2;
    const ph = label.height + padY * 2;
    const logoOnLeft = o.logo && (o.logo.placement === "tl" || o.logo.placement === "bl");
    const left = logoOnLeft ? box.left + box.width - pw : box.left;
    const top = box.top + box.height - ph;
    const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${Math.round(ph / 2)}" fill="rgb(0,0,0)" fill-opacity="0.66"/></svg>`);
    layers.push({ input: pill, left, top }, { input: label.buf, left: left + padX, top: top + padY });
  }

  let img = sharp(base).composite(layers);
  const format = o.format && o.spec.formats.includes(o.format) ? o.format : o.spec.formats[0];
  const description = o.meta?.description ?? "";
  const withMeta = (s: Sharp) => {
    if (!o.meta) return s;
    const withDesc = s.withExif({ IFD0: { ImageDescription: description.slice(0, 500), Software: "SelfRun ViralPulse AI Image Studio" } });
    return withDesc.withXmp(xmpPacket(o.meta));
  };
  const flat = await img.toBuffer();
  img = sharp(flat);
  let data: Buffer;
  let contentType: ComposeResult["contentType"];
  if (format === "png") {
    data = await withMeta(img).png({ compressionLevel: 9 }).toBuffer();
    contentType = "image/png";
  } else {
    contentType = "image/jpeg";
    data = Buffer.alloc(0);
    for (const q of [92, 86, 80, 72, 64, 56]) {
      data = await withMeta(sharp(flat)).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
      if (!o.spec.maxBytes || data.length <= o.spec.maxBytes) break;
    }
    if (o.spec.maxBytes && data.length > o.spec.maxBytes) warnings.push("The file is larger than the platform's limit even at lower quality.");
  }
  return { data, contentType, width: W, height: H, warnings, textRect };
}

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// ── probing and thumbnails ─────────────────────────────────────────────────

export interface Probe {
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
}

/** Decodes the header with sharp: a file that is not really an image throws. */
export async function probe(buf: Buffer): Promise<Probe> {
  const m = await sharp(buf, { failOn: "error", limitInputPixels: 120_000_000 }).metadata();
  if (!m.width || !m.height || !m.format) throw new Error("not an image");
  return { width: m.width, height: m.height, format: m.format, hasAlpha: !!m.hasAlpha };
}

/** A small WebP for grids: 480 px on the long side. */
export async function makeThumb(buf: Buffer, long = 480): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf, { failOn: "none", limitInputPixels: 120_000_000 }).rotate().resize({ width: long, height: long, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Normalises a generated picture (any decodable format) to PNG with its real size. */
export async function toPng(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf, { failOn: "none", limitInputPixels: 120_000_000 }).rotate().png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
