"use client";

/**
 * Razorpay Checkout for subscriptions, loaded from Razorpay's CDN only when
 * the user actually clicks to pay (never on page load). The handler's
 * response is only a claim — the server verifies its signature and re-reads
 * the subscription from Razorpay before anything is activated.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  /** A subscription checkout sets this; a one-time order checkout sets `order_id`, `amount` and `currency` instead. */
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  image?: string;
  theme?: { color?: string; backdrop_color?: string };
  retry?: { enabled: boolean; max_count?: number };
  handler: (response: never) => void;
  modal?: { ondismiss?: () => void; backdropclose?: boolean; escape?: boolean; confirm_close?: boolean; animation?: boolean };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (resp: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout needs a browser"));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't load Razorpay Checkout. Check your connection or ad blocker and try again."));
    };
    document.body.appendChild(script);
  });
  return loading;
}

/** Any CSS colour (rgb(), oklch(), a variable's value …) as the #rrggbb Razorpay needs; null when it can't be read. */
function cssToHex(value: string): string | null {
  try {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx || !value) return null;
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The theme colour as a hex Razorpay accepts (computed colours like oklch() are not, so those fall back to its default). */
function primaryColor(): string | undefined {
  return cssToHex(cssVar("--primary")) ?? "#7c3aed";
}

/** The colour of the card Checkout sits in (so the area around Razorpay's window matches the page, not white). */
function surfaceColor(varName = "--card"): string {
  return cssToHex(cssVar(varName)) ?? cssToHex(getComputedStyle(document.body).backgroundColor) ?? "#111118";
}

/** The site's own public https logo (Razorpay can't fetch localhost or private images). */
function brandLogo(): string | undefined {
  const href = document.querySelector<HTMLLinkElement>('link[rel~="apple-touch-icon"], link[rel~="icon"]')?.href;
  return href && href.startsWith("https://") ? href : undefined;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The page around Razorpay's popup: a dark branded stage instead of a blank white page. Plain DOM (not React) so no re-render can drop it
 * mid-payment; it sits just under Razorpay's own container, whose backdrop is made see-through while this is up. Returns the remover.
 */
function showStage(name: string, description: string): () => void {
  const style = document.createElement("style");
  style.textContent = ".razorpay-container .razorpay-backdrop{background:transparent !important}";
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;z-index:2147483000;overflow:hidden;pointer-events:none;background:#07070e;color:#fff;font-family:inherit";
  el.innerHTML = `
    <div style="position:absolute;left:-10rem;top:-10rem;width:34rem;height:34rem;border-radius:9999px;background:var(--primary,#7c3aed);opacity:.38;filter:blur(120px)"></div>
    <div style="position:absolute;right:-8rem;bottom:-12rem;width:38rem;height:38rem;border-radius:9999px;background:#d946ef;opacity:.26;filter:blur(130px)"></div>
    <div style="position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,.07) 1px,transparent 0);background-size:28px 28px;-webkit-mask-image:radial-gradient(ellipse at center,#000,transparent 75%);mask-image:radial-gradient(ellipse at center,#000,transparent 75%)"></div>
    <div style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:center;padding:20px 32px;color:rgba(255,255,255,.82);font-size:14px;font-weight:700;letter-spacing:.02em"><span>&#128274;&nbsp; Secure checkout</span><span style="font-size:12px;font-weight:500;opacity:.8">256-bit encrypted &middot; Powered by Razorpay</span></div>
    <div style="position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding:24px 32px 28px">
      <div><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)">You&rsquo;re paying ${esc(name)}</div><div style="margin-top:4px;max-width:36rem;font-size:14px;font-weight:500;color:rgba(255,255,255,.9)">${esc(description)}</div></div>
      <div style="display:flex;gap:16px;align-items:center;font-size:12px;color:rgba(255,255,255,.62)"><span>&#10003; Cancel any time</span><span>&#10003; GST invoice emailed</span></div>
    </div>`;
  document.head.appendChild(style);
  document.body.appendChild(el);
  return () => {
    el.remove();
    style.remove();
  };
}

/**
 * Razorpay's Checkout only knows how to open as a full-page window (a fixed container appended to <body>). To show it IN the Payment step, the
 * container is moved into the step and re-positioned to fill it, so Razorpay's window sits inside the page like any other panel. If the container
 * can't be found, nothing is touched and it stays the normal popup (which still works).
 */
function dockInto(mount: HTMLElement): void {
  const place = (c: HTMLElement) => {
    if (c.parentElement === mount) return;
    mount.appendChild(c);
    c.style.setProperty("position", "absolute", "important");
    c.style.setProperty("inset", "0", "important");
    c.style.setProperty("width", "100%", "important");
    c.style.setProperty("height", "100%", "important");
    c.style.setProperty("z-index", "1", "important");
    c.querySelectorAll<HTMLElement>(".razorpay-backdrop, iframe").forEach((el) => {
      el.style.setProperty("position", "absolute", "important");
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("height", "100%", "important");
    });
  };
  const find = () => document.querySelector<HTMLElement>("body > .razorpay-container");
  const now = find();
  if (now) return place(now);
  // Razorpay adds its container a moment after open(): watch for it (briefly).
  const obs = new MutationObserver(() => {
    const c = find();
    if (c) {
      obs.disconnect();
      place(c);
    }
  });
  obs.observe(document.body, { childList: true });
  setTimeout(() => obs.disconnect(), 5000);
}

/** Opens Checkout; resolves with the handler response, or null when the user closes it. */
export async function openSubscriptionCheckout(opts: {
  key: string;
  subscriptionId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  onPaymentFailed?: (message: string) => void;
  /** Where to show Checkout: inside this element (the Payment step) instead of as a full-page popup. Falls back to the popup if it can't be placed. */
  mount?: HTMLElement | null;
}): Promise<RazorpayHandlerResponse | null> {
  await loadRazorpayCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay Checkout didn't load.");
  const logo = brandLogo();
  const mount = opts.mount && opts.mount.isConnected && opts.mount.clientWidth > 0 ? opts.mount : null;
  // Inline in the step: the page around it is the page itself. Popup: a dark branded stage behind Razorpay's window.
  const stage = mount ? () => {} : showStage(opts.name, opts.description);
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: opts.key,
      subscription_id: opts.subscriptionId,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      // The company's own look: its logo (when it is a public https image) and theme colour (the active theme's --primary) over a dimmed page.
      ...(logo ? { image: logo } : {}),
      theme: { color: primaryColor(), backdrop_color: mount ? surfaceColor() : "#07070e" },
      retry: { enabled: true, max_count: 3 },
      handler: ((response: RazorpayHandlerResponse) => { stage(); resolve(response); }) as never,
      // Closing by a stray click outside, or Esc, asks first: nobody loses a half-done payment by accident.
      modal: { ondismiss: () => { stage(); resolve(null); }, backdropclose: false, escape: true, confirm_close: true, animation: true },
    });
    rzp.on("payment.failed", (resp) => opts.onPaymentFailed?.(resp.error?.description ?? "The payment failed."));
    try {
      rzp.open();
    } catch (err) {
      stage();
      throw err;
    }
    if (mount) dockInto(mount);
    return;
  });
}

export interface RazorpayOrderResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/** Opens Checkout for a ONE-TIME order (a top-up); resolves with the handler response, or null when the person closes it. */
export async function openOrderCheckout(opts: {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
  onPaymentFailed?: (message: string) => void;
  /** Show Checkout inside this element (a dialog) instead of as a full-page window. Falls back to the window if it can't be placed. */
  mount?: HTMLElement | null;
  /** The CSS variable of the surface behind the form, so the area around Razorpay's window matches it. */
  surface?: string;
}): Promise<RazorpayOrderResponse | null> {
  await loadRazorpayCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay Checkout didn't load.");
  const logo = brandLogo();
  const mount = opts.mount && opts.mount.isConnected && opts.mount.clientWidth > 0 ? opts.mount : null;
  const stage = mount ? () => {} : showStage(opts.name, opts.description);
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: opts.key,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: opts.currency,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      ...(logo ? { image: logo } : {}),
      theme: { color: primaryColor(), backdrop_color: mount ? surfaceColor(opts.surface) : "#07070e" },
      retry: { enabled: true, max_count: 3 },
      handler: ((response: RazorpayOrderResponse) => {
        stage();
        resolve(response);
      }) as never,
      modal: { ondismiss: () => { stage(); resolve(null); }, backdropclose: false, escape: true, confirm_close: true, animation: true },
    });
    rzp.on("payment.failed", (resp) => opts.onPaymentFailed?.(resp.error?.description ?? "The payment failed."));
    try {
      rzp.open();
    } catch (err) {
      stage();
      throw err;
    }
    if (mount) dockInto(mount);
  });
}
