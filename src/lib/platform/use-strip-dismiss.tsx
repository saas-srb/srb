"use client";

import { useEffect, useSyncExternalStore, useCallback } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import {
  STRIP_DISMISS_COOKIE_PREFIX,
  STRIP_DISMISS_KEY_PREFIX,
  TWENTY_FOUR_HOURS_MS,
} from "./strip-dismiss-shared";

export { TWENTY_FOUR_HOURS_MS };

const dismissedOverrides = new Map<string, { dismissed: boolean; at: number }>();
const DISMISS_EVENT = "workspace-strip-dismiss-update";

function getStoredDismissal(stripId: string, durationMs: number): boolean | undefined {
  try {
    const stored = window.localStorage.getItem(`${STRIP_DISMISS_KEY_PREFIX}${stripId}`);
    if (!stored) return undefined;

    const dismissedAt = Number(stored);
    const elapsed = Date.now() - dismissedAt;
    return Number.isFinite(dismissedAt) && elapsed >= 0 && elapsed < durationMs;
  } catch {
    return undefined;
  }
}

function getDismissalSnapshot(stripId: string, durationMs: number, initiallyDismissed: boolean): boolean {
  const override = dismissedOverrides.get(stripId);
  if (override) {
    if (!override.dismissed) return false;
    const elapsed = Date.now() - override.at;
    return elapsed >= 0 && elapsed < durationMs;
  }

  return getStoredDismissal(stripId, durationMs) ?? initiallyDismissed;
}

function subscribeToDismissal(stripId: string, notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== `${STRIP_DISMISS_KEY_PREFIX}${stripId}` && event.key !== null) return;
    const dismissedAt = event.newValue ? Number(event.newValue) : NaN;
    dismissedOverrides.set(stripId, {
      dismissed: Number.isFinite(dismissedAt),
      at: Number.isFinite(dismissedAt) ? dismissedAt : Date.now(),
    });
    notify();
  };
  const onDismissUpdate = (event: Event) => {
    if ((event as CustomEvent<{ stripId: string }>).detail?.stripId === stripId) notify();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(DISMISS_EVENT, onDismissUpdate);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DISMISS_EVENT, onDismissUpdate);
  };
}

function notifyDismissalChange(stripId: string) {
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: { stripId } }));
}

function setDismissCookie(stripId: string, maxAgeSecs: number) {
  try {
    document.cookie = `${STRIP_DISMISS_COOKIE_PREFIX}${stripId}=1; path=/; max-age=${Math.max(1, maxAgeSecs)}; SameSite=Lax`;
  } catch {}
}

function clearDismissCookie(stripId: string) {
  try {
    document.cookie = `${STRIP_DISMISS_COOKIE_PREFIX}${stripId}=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

function updateHtmlDismissClass(stripId: string, dismissed: boolean) {
  try {
    if (typeof document !== "undefined" && document.documentElement) {
      if (dismissed) {
        document.documentElement.classList.add(`strip-dismissed-${stripId}`);
      } else {
        document.documentElement.classList.remove(`strip-dismissed-${stripId}`);
      }
    }
  } catch {}
}

/**
 * Hook to manage 24-hour dismiss state for workspace action strips / banners.
 * When cancelled, the strip stays hidden for 24 hours across tabs and full page loads,
 * and automatically reappears once the 24 hours elapse.
 */
export function useStripDismiss(
  stripId: string,
  label?: string,
  durationMs = TWENTY_FOUR_HOURS_MS,
  initiallyDismissed = false
) {
  const subscribe = useCallback(
    (notify: () => void) => subscribeToDismissal(stripId, notify),
    [stripId]
  );
  const getSnapshot = useCallback(
    () => getDismissalSnapshot(stripId, durationMs, initiallyDismissed),
    [stripId, durationMs, initiallyDismissed]
  );
  const getServerSnapshot = useCallback(() => initiallyDismissed, [initiallyDismissed]);
  const isDismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    updateHtmlDismissClass(stripId, isDismissed);
    try {
    const key = `${STRIP_DISMISS_KEY_PREFIX}${stripId}`;
    const stored = window.localStorage.getItem(key);
    if (stored) {
      const dismissedAt = Number(stored);
      const elapsed = Date.now() - dismissedAt;
      if (Number.isFinite(dismissedAt) && elapsed >= 0 && elapsed < durationMs) {
        setDismissCookie(stripId, Math.floor((durationMs - elapsed) / 1000));
        return;
      }
      window.localStorage.removeItem(key);
    }
    if (!isDismissed) clearDismissCookie(stripId);
    } catch {}
  }, [stripId, durationMs, isDismissed]);

  const dismiss = useCallback(() => {
    dismissedOverrides.set(stripId, { dismissed: true, at: Date.now() });
    updateHtmlDismissClass(stripId, true);
    try {
    const key = `${STRIP_DISMISS_KEY_PREFIX}${stripId}`;
    window.localStorage.setItem(key, String(Date.now()));
    setDismissCookie(stripId, Math.floor(durationMs / 1000));
    } catch {}
    notifyDismissalChange(stripId);

    const stripName = label || "Notice";
    toast.info(`${stripName} dismissed for 24 hours`, {
    description: "It will automatically reappear after 24 hours.",
    action: {
      label: "Undo",
      onClick: () => {
        dismissedOverrides.set(stripId, { dismissed: false, at: Date.now() });
        try {
          window.localStorage.removeItem(`${STRIP_DISMISS_KEY_PREFIX}${stripId}`);
          clearDismissCookie(stripId);
          updateHtmlDismissClass(stripId, false);
        } catch {}
        notifyDismissalChange(stripId);
      },
    },
    });
  }, [stripId, label, durationMs]);

  return { isDismissed, dismiss };
}

/**
 * Standard compact cancel/close button for strip pills.
 */
export function StripDismissButton({ onDismiss, label }: { onDismiss: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      title={`Dismiss ${label ? `"${label}" ` : ""}for 24 hours`}
      aria-label={`Dismiss ${label ? `"${label}" ` : ""}for 24 hours`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-all hover:bg-foreground/10 hover:text-foreground dark:hover:bg-white/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <X className="size-3" />
    </button>
  );
}
