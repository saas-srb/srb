"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "askai:open";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Open state of the Ask AI sidebar, kept for the browser tab so it stays open as the user moves between pages and products. */
export function useAskAiOpen(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, read, () => false);
  const setOpen = useCallback((next: boolean) => {
    try {
      if (next) sessionStorage.setItem(KEY, "1");
      else sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: the sidebar just won't persist */
    }
    listeners.forEach((l) => l());
  }, []);
  return [open, setOpen];
}
