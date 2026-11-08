import Link from "next/link";
import { KeyRound, FileText, Link2, StickyNote } from "lucide-react";
import { ExpiryBadge, OwnerBadge, EmptyState } from "@/components/products/cybervault/DlmsUi";
import { CATEGORY_OPTIONS, RECORD_TYPE_LABEL, labelOf, type RecordType } from "@/lib/products/cybervault/constants";
import type { FeedItem } from "@/lib/products/cybervault/records";
import { formatDate } from "@/lib/utils";

const ICON: Record<RecordType, React.ReactNode> = {
  credential: <KeyRound className="size-4" />,
  document: <FileText className="size-4" />,
  link: <Link2 className="size-4" />,
  note: <StickyNote className="size-4" />,
};
export const TYPE_HREF: Record<RecordType, string> = { credential: "/cybervault/credentials", document: "/cybervault/documents", link: "/cybervault/urls", note: "/cybervault/notes" };

/** A compact mixed-type list of records (dashboard "recent", expiry board). */
export default function FeedList({ items, show = "created", empty }: { items: FeedItem[]; show?: "created" | "updated" | "expiry"; empty: string }) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-border/50">
      {items.map((i) => (
        <li key={`${i.type}-${i.id}`} className="flex items-center gap-3 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{ICON[i.type]}</span>
          <div className="min-w-0 flex-1">
            <Link href={`${TYPE_HREF[i.type]}?q=${encodeURIComponent(i.name)}&status=all`} className="block truncate text-sm font-medium hover:text-primary">
              {i.name}
            </Link>
            <p className="truncate text-[11px] text-muted-foreground">
              {RECORD_TYPE_LABEL[i.type]} · {labelOf(CATEGORY_OPTIONS[i.type], i.category)}
              {show === "created" && ` · added ${formatDate(i.createdAt)}${i.createdByName ? ` by ${i.createdByName}` : ""}`}
              {show === "updated" && ` · updated ${formatDate(i.updatedAt)}${i.updatedByName ? ` by ${i.updatedByName}` : ""}`}
            </p>
          </div>
          <div className="hidden shrink-0 sm:block">
            <OwnerBadge scope={i.scope} clientId={i.clientId} clientName={i.clientName} />
          </div>
          {show === "expiry" && (
            <div className="shrink-0 text-right">
              <ExpiryBadge state={i.expiry} date={i.expiryDate} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
