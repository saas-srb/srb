"use client";

import { useEffect, useState } from "react";
import { FALLBACK_TITLE } from "@/lib/platform/organization/title";

export interface PersonTitle { title: string; department: string | null; line: string }

/**
 * The signed-in person's title, for every sidebar footer and user menu (all products show the same words). One request per page load, shared by every
 * menu on the page; the answer comes from the organization service (`/api/account/title`), never from a product role.
 */
let pending: Promise<PersonTitle> | null = null;
let cached: PersonTitle | null = null;
const fallback: PersonTitle = { title: FALLBACK_TITLE, department: null, line: FALLBACK_TITLE };

function load(): Promise<PersonTitle> {
  pending ??= fetch("/api/account/title", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<PersonTitle>) : fallback))
    .then((t) => (cached = { title: t.title || FALLBACK_TITLE, department: t.department ?? null, line: t.line || t.title || FALLBACK_TITLE }))
    .catch(() => fallback)
    .finally(() => { setTimeout(() => { pending = null; }, 60_000); });
  return pending;
}

export function usePersonTitle(): PersonTitle {
  const [t, setT] = useState<PersonTitle>(cached ?? fallback);
  useEffect(() => { let on = true; void load().then((v) => { if (on) setT(v); }); return () => { on = false; }; }, []);
  return t;
}
