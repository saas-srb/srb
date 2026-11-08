"use client";

import { useState } from "react";
import type { LaunchView } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import LaunchPanel, { type LaunchPerms } from "./LaunchPanel";
import { Note } from "./ads-bits";

/** The launch panel on the campaign page: same controls as the wizard's last step, with its own copy of the launch so buttons update in place. */
export default function LaunchHost({ campaignId, initial, perms }: { campaignId: string; initial: LaunchView | null; perms: LaunchPerms }) {
  const [launch, setLaunch] = useState(initial);
  if (!launch) return <Note>This campaign has not been created in Meta yet. Finish the draft in the wizard, check it and create it paused from the last step.</Note>;
  return <LaunchPanel campaignId={campaignId} launch={launch} onLaunch={setLaunch} perms={perms} canLaunchNow={false} blockedReason={null} onErrors={() => {}} onGoto={() => {}} />;
}
