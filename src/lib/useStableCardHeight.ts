"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Locks a container's height to whatever the form measured before success,
 * so swapping in the (shorter) success state doesn't shrink the card.
 */
export function useStableCardHeight(isSuccess: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height && !isSuccess) setMinHeight(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSuccess]);

  return { ref, minHeight };
}
