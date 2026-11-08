import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireChatbotViewAccess } from "../access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getConversationSourcePages, searchConversations } from "@/lib/chat-conversations";
import ConversationsFilterBar from "./ConversationsFilterBar";
import ConversationsGrid, { type AdminConversationRow } from "./ConversationsGrid";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const SORT_FIELDS = ["lastActivityAt", "startedAt", "messageCount"] as const;

export default async function AdminChatbotConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    device?: string;
    sourcePage?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireChatbotViewAccess();
  const sp = await searchParams;
  const sourcePages = await getConversationSourcePages();
  const page = Math.max(Number(sp.page) || 1, 1);
  const sortBy = (SORT_FIELDS as readonly string[]).includes(sp.sortBy ?? "")
    ? (sp.sortBy as (typeof SORT_FIELDS)[number])
    : "lastActivityAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchConversations({
    page,
    pageSize: 20,
    search: sp.search,
    device: sp.device,
    sourcePage: sp.sourcePage,
    dateFrom: parseDateParam(sp.dateFrom),
    dateTo: parseDateParam(sp.dateTo, true),
    sortBy,
    sortDir,
  });

  const rows: AdminConversationRow[] = items.map((c) => ({
    _id: c._id,
    sessionId: c.sessionId,
    visitorName: c.visitorName,
    visitorEmail: c.visitorEmail,
    device: c.device,
    browser: c.browser,
    sourcePage: c.sourcePage,
    startedAt: c.startedAt,
    lastActivityAt: c.lastActivityAt,
    messageCount: c.messageCount,
    status: c.status,
    preview: c.preview,
    flagged: c.flagged,
  }));

  const hasActiveFilters = Boolean(sp.search || sp.device || sp.sourcePage || sp.dateFrom || sp.dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "AI Chatbot" }, { label: "Conversations" }]}
        title={<>Chatbot Conversations</>}
        description={<>{total} conversation{total === 1 ? "" : "s"}.</>}
      />

      <ConversationsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <ConversationsFilterBar
            initialSearch={sp.search ?? ""}
            initialDevice={sp.device ?? ""}
            initialSourcePage={sp.sourcePage ?? ""}
            sourcePages={sourcePages}
            initialDateFrom={sp.dateFrom ?? ""}
            initialDateTo={sp.dateTo ?? ""}
          />
        }
      />
    </div>
  );
}
