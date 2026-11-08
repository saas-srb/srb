"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConversationListItem } from "@/lib/products/databrain-ai/conversations";

/**
 * Client state shared by the sidebar (history, examples) and the chat page.
 * The layout is not re-rendered when a conversation is created or deleted
 * client-side, so this holds the list (the chat page never calls
 * `router.refresh()` after a turn — that would remount it mid-answer).
 */

interface Ctx {
  conversations: ConversationListItem[];
  upsert: (c: ConversationListItem) => void;
  remove: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  examples: string[];
  /** A question typed into the composer by clicking an example in the sidebar. */
  draft: { text: string; nonce: number };
  setDraft: (text: string) => void;
}

const IntelligenceContext = createContext<Ctx | null>(null);

export function IntelligenceProvider({ initial, examples, children }: { initial: ConversationListItem[]; examples: string[]; children: ReactNode }) {
  const [conversations, setConversations] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraftState] = useState({ text: "", nonce: 0 });
  const upsert = useCallback((c: ConversationListItem) => setConversations((l) => [c, ...l.filter((x) => x.id !== c.id)]), []);
  const remove = useCallback((id: string) => setConversations((l) => l.filter((x) => x.id !== id)), []);
  const setDraft = useCallback((text: string) => setDraftState((d) => ({ text, nonce: d.nonce + 1 })), []);
  const value = useMemo(() => ({ conversations, upsert, remove, activeId, setActiveId, examples, draft, setDraft }), [conversations, upsert, remove, activeId, examples, draft, setDraft]);
  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
}

export function useIntelligence(): Ctx {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error("useIntelligence must be used inside IntelligenceProvider");
  return ctx;
}
