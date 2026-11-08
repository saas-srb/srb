import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireChatbotViewAccess } from "../access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchVoiceConversations } from "@/lib/voice-conversations";
import VoiceConversationsFilterBar from "./VoiceConversationsFilterBar";
import VoiceConversationsGrid, { type AdminVoiceConversationRow } from "./VoiceConversationsGrid";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const SORT_FIELDS = ["lastActivityAt", "startedAt", "durationMs", "voiceMessageCount"] as const;

export default async function AdminVoiceConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    device?: string;
    minDuration?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireChatbotViewAccess();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const sortBy = (SORT_FIELDS as readonly string[]).includes(sp.sortBy ?? "")
    ? (sp.sortBy as (typeof SORT_FIELDS)[number])
    : "lastActivityAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchVoiceConversations({
    page,
    pageSize: 20,
    search: sp.search,
    device: sp.device,
    minDurationMs: Number(sp.minDuration) * 1000 || undefined,
    dateFrom: parseDateParam(sp.dateFrom),
    dateTo: parseDateParam(sp.dateTo, true),
    sortBy,
    sortDir,
  });

  const rows: AdminVoiceConversationRow[] = items;
  const hasActiveFilters = Boolean(sp.search || sp.device || sp.minDuration || sp.dateFrom || sp.dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "AI Chatbot" }, { label: "Voice Conversations" }]}
        title={<>Voice Conversations</>}
        description={<>{total} voice conversation{total === 1 ? "" : "s"}.</>}
      />

      <VoiceConversationsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <VoiceConversationsFilterBar
            initialSearch={sp.search ?? ""}
            initialDevice={sp.device ?? ""}
            initialMinDuration={sp.minDuration ?? ""}
            initialDateFrom={sp.dateFrom ?? ""}
            initialDateTo={sp.dateTo ?? ""}
          />
        }
      />
    </div>
  );
}
