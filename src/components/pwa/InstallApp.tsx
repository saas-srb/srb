"use client";

import { useEffect, useState } from "react";
import { Download, MonitorSmartphone, PlusSquare, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearDeferredInstall,
  detectBrowser,
  detectPlatform,
  getDeferredInstall,
  initInstallCapture,
  isStandalone,
  onInstallChange,
  type BrowserKind,
  type Platform,
} from "@/lib/pwa/client";

type State = { installed: boolean; canPrompt: boolean; platform: Platform; browser: BrowserKind };

function useInstallState(): State {
  const [state, setState] = useState<State>({ installed: false, canPrompt: false, platform: "other", browser: "other" });
  useEffect(() => {
    initInstallCapture();
    const read = () => setState({ installed: isStandalone(), canPrompt: getDeferredInstall() !== null, platform: detectPlatform(), browser: detectBrowser() });
    read();
    return onInstallChange(read);
  }, []);
  return state;
}

async function runInstall(): Promise<void> {
  const evt = getDeferredInstall();
  if (!evt) return;
  await evt.prompt();
  await evt.userChoice.catch(() => null);
  clearDeferredInstall();
}

/** How to install where the browser has no one-tap prompt (Safari on iPhone/iPad/Mac). */
function manualSteps(s: State): { icon: typeof Share; text: string }[] | null {
  if (s.platform === "ios") {
    return [
      { icon: Share, text: "Tap the Share button in Safari's toolbar." },
      { icon: PlusSquare, text: "Choose “Add to Home Screen”, then tap Add." },
    ];
  }
  if (s.platform === "mac" && s.browser === "safari") {
    return [
      { icon: Share, text: "In Safari, choose File → Add to Dock… (or the Share button)." },
      { icon: PlusSquare, text: "Confirm the name and click Add." },
    ];
  }
  return null;
}

/** The "Install the app" card used on the notification settings pages: one button where the browser allows it, steps otherwise. */
export function InstallCard() {
  const s = useInstallState();
  const steps = manualSteps(s);

  if (s.installed) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <MonitorSmartphone className="size-5 text-primary" />
        <p className="text-muted-foreground">You are using the installed app on this device.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Install the app</p>
            <p className="text-sm text-muted-foreground">Open your business from your home screen or desktop, full screen, and get notifications even when the browser is closed.</p>
          </div>
          {s.canPrompt ? (
            <Button type="button" size="sm" onClick={() => void runInstall()}>
              <Download className="size-4" data-icon="inline-start" /> Install app
            </Button>
          ) : steps ? (
            <ol className="space-y-2 text-sm">
              {steps.map(({ icon: Icon, text }, i) => (
                <li key={text} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                  <span className="flex items-start gap-1.5 text-foreground"><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              {s.browser === "firefox" && s.platform !== "android"
                ? "Firefox on a computer can't install web apps. Open this page in Chrome, Edge or Safari to install it, or keep using it in the browser."
                : "Look for “Install app” or “Add to Home screen” in your browser's menu."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const SNOOZE_KEY = "install-banner-snoozed-until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** A small dismissible banner at the bottom of products pages, only where the browser can install the app with one tap. */
export function InstallBanner() {
  const s = useInstallState();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now());
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden || s.installed || !s.canPrompt) return null;

  const snooze = () => {
    setHidden(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* ignore */
    }
  };
  return (
    <div role="dialog" aria-label="Install the app" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-2 shadow-xl sm:left-auto sm:right-4 sm:mx-0">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Download className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-foreground">Install the app</p>
        <p className="truncate text-xs text-muted-foreground">Faster access and notifications</p>
      </div>
      <Button type="button" size="sm" onClick={() => void runInstall().then(snooze)}>Install</Button>
      <button type="button" onClick={snooze} aria-label="Not now" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
    </div>
  );
}
