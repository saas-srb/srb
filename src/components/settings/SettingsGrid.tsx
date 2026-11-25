import Link from "next/link";
import { Search } from "lucide-react";
import SettingsCard from "@/components/settings/SettingsCard";
import { SETTINGS_STATUSES, STATUS_WORDS, filterCards, groupCards, type SettingsCardData, type SettingsCategory, type SettingsFilter, type SettingsStatus } from "@/components/settings/model";

const field = "h-10 rounded-xl border border-input bg-background px-3 text-sm";

/** The Search & Filters card: by name, by status and by category. A plain GET form, so it works without scripts and the result can be linked to. */
export function SettingsFilters({ action, filter, categories, searchPlaceholder, statuses = SETTINGS_STATUSES }: { action: string; filter: SettingsFilter; categories: SettingsCategory[]; searchPlaceholder: string; statuses?: SettingsStatus[] }) {
  const active = Boolean(filter.q || filter.status || filter.category);
  return (
    <form method="get" action={action} role="search" data-settings-filters className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_14rem_auto]">
        <label className="relative block">
          <span className="sr-only">Search by name</span>
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={filter.q} placeholder={searchPlaceholder} className={`${field} w-full pl-9`} />
        </label>
        <label className="block">
          <span className="sr-only">Status</span>
          <select name="status" defaultValue={filter.status} className={`${field} w-full`}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_WORDS[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Category</span>
          <select name="category" defaultValue={filter.category} className={`${field} w-full`}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Search</button>
          {active && <Link href={action} className="inline-flex h-10 items-center rounded-xl border border-border px-3 text-sm hover:bg-muted">Clear</Link>}
        </div>
      </div>
    </form>
  );
}

/** The cards under their category headings with counts, in a 3 / 2 / 1 column grid. The same on every settings page. */
export function SettingsGroups({ cards, categories, iconFor }: { cards: SettingsCardData[]; categories: SettingsCategory[]; iconFor?: (c: SettingsCardData) => import("lucide-react").LucideIcon | undefined }) {
  const groups = groupCards(cards, categories);
  if (groups.length === 0) return <SettingsEmpty />;
  return (
    <>
      {groups.map(({ category, cards: items }) => (
        <section key={category.key} aria-label={category.title} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{category.title} <span className="font-normal text-muted-foreground">({items.length})</span></h2>
            <p className="text-sm text-muted-foreground">{category.description ?? "\u00a0"}</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => <SettingsCard key={c.key} card={c} icon={iconFor?.(c)} />)}
          </div>
        </section>
      ))}
    </>
  );
}

export function SettingsEmpty() {
  return <p data-settings-empty className="rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center text-sm text-muted-foreground">Nothing matches your search. Try another word, or clear the filters.</p>;
}

/** The loading skeleton of a settings page: the same grid of grey cards. */
export function SettingsGridSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-24 animate-pulse rounded-2xl bg-card" />
      <div className="h-[72px] animate-pulse rounded-2xl bg-card" />
      {[0, 1].map((g) => (
        <div key={g} className="space-y-3">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export { filterCards };
