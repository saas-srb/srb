"use client";

import { useState, useTransition } from "react";
import { Lock, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * What a person sees when they open something they have no access to, inside the same Workspace or product shell as everyone else (no sign-in
 * redirect, no 404). It says what the thing is, who can give access and lets them ask. `request` is the server action that records the ask.
 */
export interface LockedPageProps {
  title: string;
  description?: string | null;
  /** The product or area the item belongs to ("TalentOS"). */
  area?: string | null;
  directors: { name: string; email: string }[];
  alreadyAsked?: boolean;
  request: (input: { message: string }) => Promise<{ ok: boolean; error?: string; emailed?: boolean }>;
}

export default function LockedPage({ title, description, area, directors, alreadyAsked = false, request }: LockedPageProps) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(alreadyAsked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      setError(null);
      const r = await request({ message });
      if (r.ok) setSent(true);
      else setError(r.error ?? "Could not send the request.");
    });
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-border/50 bg-card p-6 text-center sm:p-10" role="region" aria-label="No access">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Lock className="size-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{title}</h1>
        {area && <p className="text-xs font-medium text-muted-foreground">{area}</p>}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <p className="text-sm">You don&apos;t have access to this yet. Ask your Director.</p>
      {directors.length > 0 && (
        <div className="w-full rounded-xl border border-border/50 bg-muted/30 p-3 text-left text-sm">
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Who can give you access</p>
          <ul className="space-y-0.5">
            {directors.map((d) => (
              <li key={d.email}>
                <span className="font-medium">{d.name || d.email}</span>
                {d.name && <span className="text-muted-foreground"> · {d.email}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sent ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300" role="status">
          <MailCheck className="size-4" aria-hidden />
          Your request was sent. You will be told when it is handled.
        </p>
      ) : (
        <div className="w-full space-y-2">
          <label htmlFor="req-msg" className="sr-only">
            Message to your Director (optional)
          </label>
          <Textarea id="req-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} placeholder="Why do you need it? (optional)" />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" onClick={send} disabled={pending} className="w-full sm:w-auto">
            <Send className="size-4" data-icon="inline-start" />
            Request access
          </Button>
        </div>
      )}
    </div>
  );
}
