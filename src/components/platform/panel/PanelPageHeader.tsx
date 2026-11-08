/**
 * The one header every product page opens with, under the shared "Back to Workspace" action row (PanelBackBar), whose
 * "Workspace › Product" trail is the page's only breadcrumb:
 *
 *   heading section (title + description left, CTAs right) → search & filters
 *
 * It is always full width, like the dashboards'. `breadcrumbs` is still accepted so existing callers compile, but no
 * second trail is drawn.
 */
export default function PanelPageHeader({
  title,
  description,
  filters,
  actions,
  eyebrow,
  meta,
  leading,
}: {
  /** Not drawn: the Back to Workspace row is the only breadcrumb. */
  breadcrumbs?: { label: string; href?: string; panel?: string }[];
  title: React.ReactNode;
  description?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small line above the title (a record code). */
  eyebrow?: React.ReactNode;
  /** Extra rows under the description (contact links, badges, summary chips). */
  meta?: React.ReactNode;
  /** An avatar / logo shown inside the heading section, left of the title. */
  leading?: React.ReactNode;
}) {
  return (
    <header className="w-full space-y-4">
      <section className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-r from-primary/10 via-card to-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            {eyebrow ? <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description ? <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</div> : null}
            {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap sm:ml-auto items-center gap-2 [&_a]:rounded-xl [&_a]:shadow-sm [&_button]:rounded-xl">{actions}</div> : null}
        </div>
      </section>
      {filters}
    </header>
  );
}
