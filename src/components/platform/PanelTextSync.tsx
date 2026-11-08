"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePanels } from "@/components/platform/PanelsProvider";

/**
 * Keeps product names consistent everywhere without editing every sentence. Inside a product's screens, any of a product's
 * registered aliases ("HRMS", "Standard Operating Procedures" …, set per product in Platform Console → Products) that still
 * appears in the page text, placeholders or tooltips is shown as the product's current registry name instead — an
 * acronym becomes the short name, a longer old name becomes the full name. Rename a product once and the whole app follows.
 *
 * It only ever changes what is displayed: form values, code blocks, the public website and the Platform Console itself
 * are left untouched.
 */

const SKIP = "script,style,textarea,input,select,code,pre,svg,[contenteditable='true'],[data-panel-sync='off']";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const isAcronym = (a: string) => /^[A-Z]{2,6}$/.test(a);
/**
 * React attaches an internal fiber key to every DOM node it has hydrated. Text or attributes are only ever changed on nodes that carry
 * it: a node React hasn't reached yet (a slow page, a Suspense boundary still streaming) is left alone and retried, so the text React
 * compares during hydration is always the text the server sent.
 */
const isHydrated = (node: Node) => {
  for (const k in node) if (k.startsWith("__reactFiber$")) return true;
  return false;
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function PanelTextSync() {
  const panels = usePanels();
  const pathname = usePathname();
  const segment = pathname?.split("/")[1] ?? "";
  const enabled = Boolean(panels[segment]) && segment !== "website";

  useEffect(() => {
    if (!enabled) return;
    const map = new Map<string, string>();
    for (const p of Object.values(panels)) {
      if (p.key === "website") continue;
      for (const alias of p.aliases ?? []) {
        const to = isAcronym(alias) ? p.shortName : p.name;
        if (alias && to && alias !== to) map.set(alias, to);
      }
    }
    if (map.size === 0) return;
    const re = new RegExp(`(?<![A-Za-z0-9])(${[...map.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![A-Za-z0-9])`, "g");
    const swap = (text: string) => text.replace(re, (m) => map.get(m) ?? m);

    // Nodes that matched but weren't hydrated yet, retried until React has reached them.
    const deferred = new Map<Node, number>();
    function fixText(node: Text) {
      const v = node.nodeValue;
      if (!v || v.length < 2 || !re.test(v)) return;
      re.lastIndex = 0;
      if (node.parentElement?.closest(SKIP)) return;
      if (!isHydrated(node) && !(node.parentElement && isHydrated(node.parentElement))) { deferred.set(node, (deferred.get(node) ?? 0) + 1); return; }
      deferred.delete(node);
      const next = swap(v);
      if (next !== v) node.nodeValue = next;
    }
    function fixAttrs(el: Element) {
      if (el.closest(SKIP) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (!isHydrated(el)) { if (ATTRS.some((a) => { const v = el.getAttribute(a); const hit = !!v && re.test(v); re.lastIndex = 0; return hit; })) deferred.set(el, (deferred.get(el) ?? 0) + 1); return; }
      deferred.delete(el);
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) {
          re.lastIndex = 0;
          const next = swap(v);
          if (next !== v) el.setAttribute(a, next);
        }
        re.lastIndex = 0;
      }
    }
    function scan(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
      if (!(root instanceof Element)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) fixText(n as Text);
      fixAttrs(root);
      root.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach(fixAttrs);
    }

    // Wait until React has hydrated the page, so the text we change is never text React is about to compare.
    let observer: MutationObserver | null = null;
    let pending = new Set<Node>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const batch = pending;
      pending = new Set();
      batch.forEach((n) => n.isConnected && scan(n));
    };
    // Come back for what React hadn't hydrated yet (up to ~30 s, then give up: a node React never claims isn't ours to touch).
    let retry: ReturnType<typeof setInterval> | null = null;
    const retryDeferred = () => {
      for (const [n, tries] of [...deferred]) {
        if (!n.isConnected || tries > 60) deferred.delete(n);
        else scan(n);
      }
      if (deferred.size === 0 && retry) { clearInterval(retry); retry = null; }
    };
    const start = setTimeout(() => {
      scan(document.body);
      if (deferred.size > 0) retry = setInterval(retryDeferred, 500);
      observer = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") pending.add(r.target);
          else if (r.type === "childList") r.addedNodes.forEach((n) => pending.add(n));
          else if (r.type === "attributes") pending.add(r.target);
        }
        if (!timer) timer = setTimeout(flush, 40);
        if (deferred.size > 0 && !retry) retry = setInterval(retryDeferred, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    }, 350);

    return () => {
      clearTimeout(start);
      if (timer) clearTimeout(timer);
      if (retry) clearInterval(retry);
      observer?.disconnect();
    };
  }, [enabled, panels, pathname]);

  return null;
}
