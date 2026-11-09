import type { ReactNode } from "react";

/** The card a form page puts its form in (the forms used to be popups; same content, now a page). */
export function FormShell({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6">{children}</section>;
}
export function FormHeader({ children }: { children: ReactNode }) { return <div className="space-y-1">{children}</div>; }
export function FormTitle({ children }: { children: ReactNode }) { return <h2 className="text-lg font-semibold leading-tight">{children}</h2>; }
export function FormDescription({ children }: { children: ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
export function FormFooter({ children }: { children: ReactNode }) { return <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-4">{children}</div>; }
