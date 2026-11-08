"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

/**
 * Keyed interface text for components with a lot of fixed wording (the
 * product catalogue, the offers & rewards pages, the chat widget). Keys are
 * code (`"catalog.hero.title"`); the TEXT is CMS content. Dictionaries layer:
 * the site-wide one (CMS → Site Identity → Page & widget text) is provided at
 * the root, and a section can add its own on top (e.g. the catalogue
 * section's text in its config). A missing key renders as "".
 */
const TextContext = createContext<Record<string, string>>({});

export function TextProvider({ text, children }: { text: Record<string, string>; children: React.ReactNode }) {
  const parent = useContext(TextContext);
  const value = useMemo(() => ({ ...parent, ...text }), [parent, text]);
  return <TextContext.Provider value={value}>{children}</TextContext.Provider>;
}

/** `t("catalog.hero.title")` → the CMS text for that key. */
export function useText(): (key: string) => string {
  const dict = useContext(TextContext);
  return useCallback((key: string) => dict[key] ?? "", [dict]);
}
