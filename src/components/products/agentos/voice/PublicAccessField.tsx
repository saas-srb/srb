"use client";

import { useState } from "react";
import { normalizeOrigins } from "@/lib/products/agentos/voice/config";

/** Public website access for a voice agent: off unless the company turns it on, and only from the websites it lists. */
export default function PublicAccessField({ isPublic, origins, onChange, disabled }: { isPublic: boolean; origins: string[]; onChange: (next: { isPublic: boolean; allowedOrigins: string[] }) => void; disabled?: boolean }) {
  // Kept as typed so a new line or a half-typed address isn't rewritten under the cursor.
  const [text, setText] = useState(origins.join("\n"));
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let problem: string | null = null;
  try {
    normalizeOrigins(lines);
  } catch (e) {
    problem = e instanceof Error ? e.message : "Check the website addresses.";
  }
  if (!problem && isPublic && lines.length === 0) problem = "Add at least one website, or visitors won't be able to open this agent.";

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={isPublic} disabled={disabled} onChange={(e) => onChange({ isPublic: e.target.checked, allowedOrigins: lines })} />
        <span>
          <span className="block text-sm font-medium">Public on website</span>
          <span className="block text-xs text-muted-foreground">Lists this agent in your website&apos;s agent directory so a visitor can talk to it. Nothing is public unless this is on. Visitor calls are rate limited and counted against your voice minutes.</span>
        </span>
      </label>
      <div className="space-y-1.5">
        <label htmlFor="v-origins" className="text-sm font-medium">Websites allowed to open this agent</label>
        <textarea
          id="v-origins"
          rows={3}
          value={text}
          disabled={disabled}
          placeholder="One address per line, for example https://www.example.com"
          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          onChange={(e) => {
            setText(e.target.value);
            onChange({ isPublic, allowedOrigins: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) });
          }}
        />
        {problem ? <p role="alert" className="text-[11px] text-destructive">{problem}</p> : <p className="text-[11px] text-muted-foreground">Only these websites can start a conversation. Use https:// (http:// only for localhost). Up to 20.</p>}
      </div>
    </div>
  );
}
