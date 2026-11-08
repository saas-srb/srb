"use client";

import LiveCountdown from "@/components/offers/LiveCountdown";

/** Hero / deal-of-the-day countdown — thin wrapper over the shared `LiveCountdown` (server-accurate clock, urgency states, progress bar). */
export default function CampaignCountdown({
  endDate,
  startDate,
  label,
  onExpire,
  showUrgency = true,
  onDark = false,
}: {
  endDate: string;
  startDate?: string;
  label?: string;
  onExpire?: () => void;
  showUrgency?: boolean;
  onDark?: boolean;
}) {
  return <LiveCountdown endDate={endDate} startDate={startDate} label={label} onExpire={onExpire} showUrgency={showUrgency} onDark={onDark} variant="boxes" />;
}
