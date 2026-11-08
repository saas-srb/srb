import type { Attachment } from "@/lib/ai/agent/types";

/** Client-side preparation of attachments: images are shrunk, text is read, everything is size-capped so the request stays small. */

export const MAX_FILES = 5;
export const MAX_TOTAL_BYTES = 3_600_000;
const MAX_IMAGE_EDGE = 1600;
const TEXT_EXT = /\.(txt|csv|json|md|tsv|log|xml|html?)$/i;

export interface Picked extends Attachment {
  /** Small preview for images. */
  thumb?: string;
  bytes: number;
}

const bytesOfDataUrl = (d: string) => Math.floor((d.length * 3) / 4);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be opened."));
    img.src = src;
  });
}

export async function shrinkImage(source: Blob | HTMLCanvasElement | HTMLVideoElement): Promise<{ data: string; thumb: string }> {
  let img: CanvasImageSource;
  let w: number;
  let h: number;
  if (source instanceof Blob) {
    const el = await loadImage(await readAsDataUrl(source));
    img = el; w = el.naturalWidth; h = el.naturalHeight;
  } else if (source instanceof HTMLVideoElement) {
    img = source; w = source.videoWidth; h = source.videoHeight;
  } else {
    img = source; w = source.width; h = source.height;
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const draw = (sc: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * sc));
    c.height = Math.max(1, Math.round(h * sc));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Your browser can't process images.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  const main = draw(scale);
  return { data: main.toDataURL("image/jpeg", 0.82), thumb: draw(Math.min(1, 96 / Math.max(w, h))).toDataURL("image/jpeg", 0.6) };
}

export async function pickFile(file: File): Promise<Picked> {
  const name = file.name || "file";
  if (file.type.startsWith("image/")) {
    const { data, thumb } = await shrinkImage(file);
    return { name, mime: "image/jpeg", kind: "image", data, thumb, bytes: bytesOfDataUrl(data) };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > 3_000_000) throw new Error(`${name} is larger than 3 MB. Attach fewer pages or a smaller file.`);
    const data = await readAsDataUrl(file);
    return { name, mime: "application/pdf", kind: "pdf", data: data.replace(/^data:[^;]*;base64,/, "data:application/pdf;base64,"), bytes: file.size };
  }
  if (/\.(xlsx|docx)$/i.test(name)) {
    if (file.size > 3_000_000) throw new Error(`${name} is larger than 3 MB.`);
    return { name, mime: file.type || "application/octet-stream", kind: "doc", data: await readAsDataUrl(file), bytes: file.size };
  }
  if (file.type.startsWith("text/") || TEXT_EXT.test(name) || file.type === "application/json") {
    if (file.size > 300_000) throw new Error(`${name} is larger than 300 KB. Attach a smaller extract.`);
    const text = await file.text();
    return { name, mime: file.type || "text/plain", kind: "text", data: text, bytes: text.length };
  }
  throw new Error(`${name}: attach an image, PDF, Excel (.xlsx), Word (.docx) or a text/CSV file.`);
}

export const totalBytes = (list: { bytes: number }[]) => list.reduce((s, f) => s + f.bytes, 0);

/** Asks the browser for one frame of the screen/tab/window the person picks (their own screenshot, no extra software). */
export async function captureScreen(): Promise<Picked> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Your browser can't capture the screen. Paste or upload a screenshot instead.");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 250));
    const { data, thumb } = await shrinkImage(video);
    return { name: "screen-capture.jpg", mime: "image/jpeg", kind: "image", data, thumb, bytes: bytesOfDataUrl(data) };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
