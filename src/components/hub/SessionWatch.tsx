"use client";

import { useEffect } from "react";

/**
 * Notices when this sign-in has been ended elsewhere (the account signed in on another device on the Free plan, or was signed out
 * remotely) and takes the person to the sign-in page with a short explanation, instead of leaving a page open that no longer works.
 */
export default function SessionWatch() {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/account/session", { cache: "no-store" });
        if (r.status === 401 && !stopped) {
          stopped = true;
          window.location.assign("/commandos/login?ended=1");
        }
      } catch {
        /* offline: try again next time */
      }
    };
    const timer = setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return null;
}
