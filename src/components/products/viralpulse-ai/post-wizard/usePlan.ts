"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { wizardPlanAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import type { PublishPlan } from "@/lib/products/viralpulse-ai/publishing";

/**
 * The publishing plan (what each platform's own validator says about the saved post). The plan reads the SAVED post, so
 * `ensureSaved` runs first; it re-runs a moment after `key` changes so edits show up without a button.
 */
export function usePlan(enabled: boolean, key: string, ensureSaved: () => Promise<string | null>, delayMs = 900) {
  const [plan, setPlan] = useState<PublishPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    const id = await ensureSaved();
    if (mine !== seq.current) return;
    if (!id) {
      setLoading(false);
      setPlan(null);
      setError("Finish the earlier steps first; the checks need a saved post.");
      return;
    }
    const res = await wizardPlanAction(id);
    if (mine !== seq.current) return;
    setLoading(false);
    if (res.ok) setPlan(res.plan);
    else setError(res.error);
  }, [ensureSaved]);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => void refresh(), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the key (the inputs of the check) changes
  }, [enabled, key]);

  return { plan, loading, error, refresh };
}
