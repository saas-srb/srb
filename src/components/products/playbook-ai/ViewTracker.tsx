"use client";

import { useEffect } from "react";
import { recordViewAction } from "@/app/(products)/playbook-ai/(protected)/actions";

/** Records the view after the page mounts (never during render, so prefetching a link can't count as a read). The server dedupes repeats. */
export default function ViewTracker({ sopId }: { sopId: string }) {
  useEffect(() => {
    void recordViewAction(sopId);
  }, [sopId]);
  return null;
}
