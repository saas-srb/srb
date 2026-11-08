import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { Plus, Upload, Globe, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard, Stat } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar, { type FilterField } from "@/components/products/cybervault/DlmsFilterBar";
import FeedList from "@/components/products/cybervault/FeedList";
import { CredentialsTable, DocumentsTable, LinksTable, NotesList } from "@/components/products/cybervault/RecordTables";
import { CredentialDialog, DocumentDialog, LinkDialog, NoteDialog } from "@/components/products/cybervault/RecordDialogs";
import { canWriteRow, type LockedOwner } from "@/components/products/cybervault/vault-types";
import { cn, formatDateTime } from "@/lib/utils";
import { can, type DlmsViewer } from "@/lib/products/cybervault/viewer";
import { countRecords, credentialOptions, feedItems, listCredentials, listDocuments, listLinks, listNotes } from "@/lib/products/cybervault/records";
import { recentActivity, AUDIT_ACTION_LABEL } from "@/lib/products/cybervault/audit";
import { buildVaultUi } from "@/lib/products/cybervault/ui";
import { queryFrom, STATUS_OPTIONS, type SearchParams } from "@/lib/products/cybervault/page";
import { CATEGORY_OPTIONS, RECORD_TYPES, type RecordType } from "@/lib/products/cybervault/constants";
import { getSettings } from "@/lib/products/cybervault/settings";

/**
 * The single profile used for BOTH the Company Vault and a client's DLMS
 * profile: overview + credentials + URLs + documents + notes + expiry, all
 * pinned to one owner. Client details come from the PMS client master (never
 * copied); company details from the HRMS company record.
 */

export interface OwnerInfo {
  title: string;
  subtitle: string;
  badge?: string;
  lines: { icon: "web" | "mail" | "phone"; text: string; href?: string }[];
  details: { label: string; value: string }[];
  notice?: string;
  crumbs: { label: string; href?: string }[];
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "credentials", label: "Credentials" },
  { key: "urls", label: "URLs & Accounts" },
  { key: "documents", label: "Documents" },
  { key: "notes", label: "Notes" },
  { key: "expiry", label: "Expiry" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const TAB_TYPE: Partial<Record<Tab, RecordType>> = { credentials: "credential", urls: "link", documents: "document", notes: "note" };
const ICONS = { web: Globe, mail: Mail, phone: Phone };

export default async function OwnerVault({ viewer, owner, basePath, info, sp }: { viewer: DlmsViewer; owner: LockedOwner; basePath: string; info: OwnerInfo; sp: SearchParams }) {
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overview";
  const ownerQuery = { scope: owner.scope, clientId: owner.clientId ?? undefined };
  const ui = await buildVaultUi(viewer);
  const writable = canWriteRow(ui, owner.scope, owner.clientId);

  const counts = await Promise.all(RECORD_TYPES.map((t) => countRecords(viewer, t, ownerQuery)));
  const countOf = (t: RecordType) => counts[RECORD_TYPES.indexOf(t)];
  const tabCount: Partial<Record<Tab, number>> = { credentials: countOf("credential"), urls: countOf("link"), documents: countOf("document"), notes: countOf("note") };

  const tabType = TAB_TYPE[tab];
  const listQuery = { ...queryFrom(sp), ...ownerQuery };
  const filterFields: FilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: "Search this vault…" },
    ...(tabType ? [{ key: "category", label: "Category", type: "select" as const, options: CATEGORY_OPTIONS[tabType], allLabel: "All" }] : []),
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, allLabel: "Active" },
  ];
  const filterBar = <DlmsFilterBar fields={filterFields} values={{ q: sp.q ?? "", category: sp.category ?? "", status: sp.status ?? "" }} />;

  let actions: React.ReactNode = null;
  if (writable) {
    const add = (label: string, icon: React.ReactNode) => (
      <Button size="sm">
        {icon}
        {label}
      </Button>
    );
    if (tab === "credentials" && ui.create) actions = <CredentialDialog ui={ui} locked={owner} trigger={add("Add credential", <Plus className="size-3.5" data-icon="inline-start" />)} />;
    if (tab === "urls" && ui.create) actions = <LinkDialog ui={ui} locked={owner} credentials={await credentialOptions(viewer)} trigger={add("Add URL / account", <Plus className="size-3.5" data-icon="inline-start" />)} />;
    if (tab === "documents" && ui.manageDocs) actions = <DocumentDialog ui={ui} locked={owner} trigger={add("Upload document", <Upload className="size-3.5" data-icon="inline-start" />)} />;
    if (tab === "notes" && ui.create) actions = <NoteDialog ui={ui} locked={owner} trigger={add("Add note", <Plus className="size-3.5" data-icon="inline-start" />)} />;
  }

  let body: React.ReactNode;
  if (tab === "overview") {
    const settings = await getSettings();
    const expiring = (await Promise.all((["credential", "document", "link"] as const).map((t) => feedItems(viewer, t, { ...ownerQuery, expiry: "set", sort: "expiry", limit: 50 })))).flat().filter((i) => i.expiry === "expired" || i.expiry === "expiring").sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
    const activity = can(viewer, "VIEW_AUDIT") ? await recentActivity({ limit: 6, scope: owner.scope, clientId: owner.clientId ?? undefined }) : [];
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="About" className="lg:col-span-1" description={info.notice}>
          <div className="space-y-3">
            {info.lines.length > 0 && (
              <ul className="space-y-1.5">
                {info.lines.map((l) => {
                  const Icon = ICONS[l.icon];
                  return (
                    <li key={l.text} className="flex items-center gap-2 text-sm">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      {l.href ? (
                        <a href={l.href} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">{l.text}</a>
                      ) : (
                        <span className="truncate">{l.text}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="space-y-1.5 text-sm">
              {info.details.map((d) => (
                <div key={d.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="truncate text-right font-medium">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </SectionCard>
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Credentials" value={countOf("credential")} />
            <Stat label="URLs / accounts" value={countOf("link")} />
            <Stat label="Documents" value={countOf("document")} />
            <Stat label="Notes" value={countOf("note")} />
          </div>
          <SectionCard title="Expiry" description={`Expired, or within ${settings.warnDays} days`}>
            <FeedList items={expiring} show="expiry" empty="Nothing is expired or expiring soon." />
          </SectionCard>
          {can(viewer, "VIEW_AUDIT") && (
            <SectionCard title="Recent activity">
              {activity.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {activity.map((a) => (
                    <li key={a._id} className="py-1.5 text-sm">
                      <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span> · {a.entityLabel ?? a.entity}
                      <span className="block text-[11px] text-muted-foreground">{a.actorEmail ?? "system"} · {formatDateTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    );
  } else if (tab === "credentials") {
    body = <SectionCard title="Credentials"><CredentialsTable rows={await listCredentials(viewer, listQuery)} ui={ui} locked={owner} /></SectionCard>;
  } else if (tab === "urls") {
    const [rows, creds] = await Promise.all([listLinks(viewer, listQuery), credentialOptions(viewer)]);
    body = <SectionCard title="URLs & accounts"><LinksTable rows={rows} ui={ui} locked={owner} credentials={creds} /></SectionCard>;
  } else if (tab === "documents") {
    body = <SectionCard title="Documents"><DocumentsTable rows={await listDocuments(viewer, listQuery)} ui={ui} locked={owner} /></SectionCard>;
  } else if (tab === "notes") {
    body = <SectionCard title="Notes"><NotesList rows={await listNotes(viewer, listQuery)} ui={ui} locked={owner} /></SectionCard>;
  } else {
    const items = (await Promise.all((["credential", "document", "link"] as const).map((t) => feedItems(viewer, t, { ...ownerQuery, expiry: "set", sort: "expiry", limit: 200 })))).flat().sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
    body = <SectionCard title="Everything with an expiry date" description="Soonest first"><FeedList items={items} show="expiry" empty="No expiry dates are set for this vault." /></SectionCard>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={info.title}
        crumbs={info.crumbs}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {info.badge && <Badge variant="outline">{info.badge}</Badge>}
            {info.subtitle}
          </span>
        }
        actions={actions}
      />
      <PanelTabs label="Vault sections" active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: tabCount[t.key], href: t.key === "overview" ? basePath : `${basePath}?tab=${t.key}` }))} />
      {tabType && filterBar}
      {body}
    </div>
  );
}

