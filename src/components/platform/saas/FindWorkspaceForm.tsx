"use client";

import { useActionState } from "react";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { findWorkspace } from "@/app/(platform)/saas/actions";

export default function FindWorkspaceForm({ plain = false }: { plain?: boolean }) {
  const [state, action, pending] = useActionState(findWorkspace, null);

  if (!plain) {
    return (
      <form action={action} className="sr-card space-y-5" noValidate>
        <div>
          <label htmlFor="workspace-hero" className="sr-label">Your workspace address</label>
          <input id="workspace-hero" name="workspace" className="sr-input" placeholder="yourcompany  or  yourcompany.com" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          <p className="mt-1.5 text-sm sr-muted">The name or domain of your company&apos;s workspace — it&apos;s in your invitation email.</p>
          {state?.error && <p role="alert" className="mt-2 text-sm" style={{ color: "#c0262d" }}>{state.error}</p>}
        </div>
        <button type="submit" className="sr-btn sr-btn-primary w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue to sign in
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="workspace-section" className="text-sm font-semibold text-foreground">Workspace address</label>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="workspace-section"
            name="workspace"
            className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="yourcompany  or  yourcompany.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        {state?.error && (
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to sign in <ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}
