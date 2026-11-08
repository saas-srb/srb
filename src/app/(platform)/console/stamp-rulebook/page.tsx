import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { listJurisdictions, loadJurisdiction } from "@/lib/products/contractflow-ai/stamp/store";
import { JURISDICTIONS } from "@/lib/products/contractflow-ai/stamp/structure";
import StampRulebookManager from "./StampRulebookManager";

export const metadata: Metadata = { title: "Stamp rulebook" };
export const dynamic = "force-dynamic";

export default async function StampRulebookPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const user = await requirePlatformPermission("stamp.read");
  const { state } = await searchParams;
  const summaries = await listJurisdictions();
  const selected = state && JURISDICTIONS.some((j) => j.code === state) ? await loadJurisdiction(state) : null;
  const total = summaries.reduce((n, s) => n + s.entries, 0);
  const confirmed = summaries.reduce((n, s) => n + s.confirmed, 0);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Stamp rulebook"
        description="Stamp duty for every state and union territory, by kind of document. Used for guidance in ContractFlow's stamping step."
        crumbs={[{ label: "Administration" }]}
      />
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>Stamp duty is state law. This table ships with the structure only: no amount has been entered for any state. Type each figure from the state&apos;s Stamp Act or notification and give the link to it. An entry counts as checked only after someone with the confirm permission confirms it, and any later change removes that confirmation. Companies are always told that the figures are guidance, never authoritative.</p>
      </div>
      <div className={`rounded-lg border p-4 text-sm ${total - confirmed > 0 || total === 0 ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
        {total === 0 ? <p><span className="font-medium">Nothing has been entered yet.</span> The stamping step will say that no duty is available for any state.</p> : <p><span className="font-medium">{total} entr{total === 1 ? "y" : "ies"}, {confirmed} confirmed, {total - confirmed} not confirmed.</span></p>}
      </div>
      <StampRulebookManager summaries={summaries} selected={selected} canEdit={can(user, "stamp.edit")} canConfirm={can(user, "stamp.confirm")} />
    </div>
  );
}
