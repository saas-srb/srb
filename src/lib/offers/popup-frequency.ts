import type { PopupFrequency } from "@/lib/offers/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

function lastShownKey(campaignId: string) {
  return `offer_popup_last:${campaignId}`;
}
function seenEverKey(campaignId: string) {
  return `offer_popup_seen_ever:${campaignId}`;
}
function closedSessionKey(campaignId: string) {
  return `offer_popup_closed_session:${campaignId}`;
}

/**
 * Whether the popup is allowed to trigger right now, per its configured
 * frequency. Always checked BEFORE arming any trigger listener — never
 * shown, then immediately reconsidered. A close within the current session
 * always suppresses further shows this session, regardless of frequency
 * (the spec's own explicit anti-spam rule), via `closedSessionKey`.
 */
export function popupMayShow(campaignId: string, frequency: PopupFrequency): boolean {
  try {
    if (window.sessionStorage.getItem(closedSessionKey(campaignId))) return false;

    if (frequency === "every_visit") return true;

    if (frequency === "session") {
      return !window.sessionStorage.getItem(`offer_popup_shown_session:${campaignId}`);
    }

    if (frequency === "per_campaign") {
      return !window.localStorage.getItem(seenEverKey(campaignId));
    }

    if (frequency === "daily" || frequency === "every_3_days") {
      const last = Number(window.localStorage.getItem(lastShownKey(campaignId)) ?? 0);
      const windowMs = frequency === "daily" ? DAY_MS : 3 * DAY_MS;
      return !last || Date.now() - last > windowMs;
    }

    return true;
  } catch {
    return true; // storage unavailable (private mode etc.) — fail open, same as "every_visit"
  }
}

/** Call once, right when the popup actually renders (not on close), to record the frequency-relevant timestamp/flag. */
export function markPopupShown(campaignId: string, frequency: PopupFrequency): void {
  try {
    if (frequency === "session") window.sessionStorage.setItem(`offer_popup_shown_session:${campaignId}`, "1");
    if (frequency === "per_campaign") window.localStorage.setItem(seenEverKey(campaignId), "1");
    if (frequency === "daily" || frequency === "every_3_days") window.localStorage.setItem(lastShownKey(campaignId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Call when the visitor closes/dismisses the popup — blocks any further show this session regardless of frequency. */
export function markPopupClosed(campaignId: string): void {
  try {
    window.sessionStorage.setItem(closedSessionKey(campaignId), "1");
  } catch {
    /* ignore */
  }
}
