import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Copy, Pencil, Archive, ArchiveRestore, Trash2, Rocket, CalendarClock, CalendarX, Plus, Film, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader, SectionCard, Notice, EmptyState } from "@/components/products/viralpulse-ai/SmmsUi";
import { PlatformChip, StatusBadge, MediaThumb } from "@/components/products/viralpulse-ai/SmmsBits";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import GenerateBar from "@/components/products/viralpulse-ai/GenerateBar";
import CampaignStrategyEditor from "@/components/products/viralpulse-ai/CampaignStrategyEditor";
import NewAdForm from "@/components/products/viralpulse-ai/NewAdForm";
import LmsLinker from "@/components/products/viralpulse-ai/LmsLinker";
import VersionHistory from "@/components/products/viralpulse-ai/VersionHistory";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getCampaign } from "@/lib/products/viralpulse-ai/campaigns";
import { listAdsForCampaign } from "@/lib/products/viralpulse-ai/ads";
import { getMediaMany, toMediaCard } from "@/lib/products/viralpulse-ai/media";
import { listVersions } from "@/lib/products/viralpulse-ai/generations";
import { paidPerformance } from "@/lib/products/viralpulse-ai/analytics";
import { listLiveOffers, listClientChoices } from "@/lib/products/viralpulse-ai/brand";
import { listCampaigns as listLmsCampaigns } from "@/lib/campaigns";
import { isOpenAIConfigured } from "@/lib/openai";
import { campaignBriefContext } from "@/lib/products/viralpulse-ai/ai-field/context";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import LaunchHost from "@/components/products/viralpulse-ai/ads/LaunchHost";
import { loadPerformance, loadWizard } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { LIST_STATUS_LABEL, adsManagerUrl, formatMinor, goalLabel, listStatus, reviewLabel, DESTINATION_LABEL } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { META_OBJECTIVE_LABEL } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { ExternalLink } from "lucide-react";
import { PLATFORM_META, findFormat } from "@/lib/products/viralpulse-ai/constants";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  archiveCampaignAction,
  createAdAction,
  deleteCampaignAction,
  duplicateCampaignAction,
  generateCampaignAction,
  linkLmsCampaignsAction,
  setCampaignLifecycleAction,
} from "@/app/(products)/viralpulse-ai/(protected)/actions";

export const maxDuration = 300;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "VIEW_CAMPAIGNS")) redirect("/viralpulse-ai");
  const { id } = await params;
  const c = await getCampaign(id);
  if (!c) notFound();
  const [ads, versions, perf, offers, clients, lmsOptions] = await Promise.all([
    listAdsForCampaign(id),
    listVersions("campaign", id),
    paidPerformance({ campaignId: id }),
    listLiveOffers(50),
    listClientChoices(),
    listLmsCampaigns().catch(() => []),
  ]);
  const wiz = await loadWizard(id);
  const launch = wiz?.launch ?? null;
  const metaPerf = launch ? await loadPerformance(id, launch.currency) : null;
  const isMetaCampaign = c.platforms.some((p) => p === "facebook" || p === "instagram");
  const draftMeta = wiz?.state.meta ?? null;
  const overall = listStatus(launch ? { state: launch.state, delivery: launch.delivery, active: launch.active, review: launch.review, stopTime: launch.stopTime } : null);
  const thumbs = new Map((await getMediaMany(ads.flatMap((a) => [a.mediaIds[0], a.thumbnailId].filter((x): x is string => Boolean(x))))).map((m) => [m._id, toMediaCard(m)]));
  const canEdit = can(viewer, "EDIT_CAMPAIGNS") && c.status !== "archived";
  const canAds = can(viewer, "CREATE_ADS") && c.status !== "archived";
  const hasAi = Boolean(c.ai.summary || c.ai.adConcepts.length);
  const offer = offers.find((o) => o._id === c.offerId);
  const client = clients.find((x) => x._id === c.clientId);
  const brief: [string, string][] = [
    ["Objective", c.objective],
    ["Target audience", c.targetAudience],
    ["Industry", c.industry],
    ["Location", c.location],
    ["Budget", c.budget !== null ? formatCurrency(c.budget, c.currency) : ""],
    ["Duration", c.startDate ? `${formatDate(c.startDate)} – ${c.endDate ? formatDate(c.endDate) : "open"}` : ""],
    ["CTA", c.cta],
    ["Landing page", c.landingPage],
    ["Offer / service", c.offerService],
    ["Promoted offer", offer ? `${offer.title} (${offer.badge})` : c.offerId ? "An offer that is no longer live" : ""],
    ["Client", client?.name ?? ""],
    ["Keywords", c.keywords.join(", ")],
    ["Tone", c.tone],
    ["Language", c.language],
    ["Brand information", c.brandInfo],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        crumbs={[{ label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" }, { label: c.name }]}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {isMetaCampaign ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{LIST_STATUS_LABEL[overall]}</span> : <StatusBadge status={c.status} />}
            {c.platforms.map((p) => <PlatformChip key={p} platform={p} />)}
            <span>{`· ${ads.length} ad${ads.length === 1 ? "" : "s"} · updated ${formatDateTime(c.updatedAt)}`}</span>
          </span>
        }
        actions={
          <>
            {canEdit && <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/viralpulse-ai/campaigns/${id}/edit`} />}><Pencil className="size-3.5" /> {isMetaCampaign ? "Open in wizard" : "Edit brief"}</Button>}
            {can(viewer, "CREATE_CAMPAIGNS") && <ActionButton action={duplicateCampaignAction.bind(null, id)} success="Duplicated" redirectPrefix="/viralpulse-ai/campaigns/"><Copy className="size-3.5" /> Duplicate</ActionButton>}
            {!isMetaCampaign && c.status !== "archived" && c.status !== "published" && can(viewer, "SCHEDULE_POSTS") && (c.status === "scheduled" ? (
              <ActionButton action={setCampaignLifecycleAction.bind(null, id, "unschedule")} success="Launch unscheduled"><CalendarX className="size-3.5" /> Unschedule</ActionButton>
            ) : (
              <ActionButton action={setCampaignLifecycleAction.bind(null, id, "scheduled")} success="Launch scheduled for the start date"><CalendarClock className="size-3.5" /> Schedule launch</ActionButton>
            ))}
            {!isMetaCampaign && c.status !== "archived" && c.status !== "published" && can(viewer, "PUBLISH_CONTENT") && (
              <ActionButton variant="default" action={setCampaignLifecycleAction.bind(null, id, "published")} success="Marked as launched" confirm={{ title: "Track this campaign as launched by hand?", description: "This platform cannot be launched from here. Confirm you set it live in the platform's own ads manager. It is recorded under your name and shown as manually tracked, not as verified.", confirmLabel: "Mark launched" }}>
                <Rocket className="size-3.5" /> Launched by hand
              </ActionButton>
            )}
            {can(viewer, "EDIT_CAMPAIGNS") && (c.status === "archived" ? (
              <ActionButton action={archiveCampaignAction.bind(null, id, false)} success="Restored"><ArchiveRestore className="size-3.5" /> Restore</ActionButton>
            ) : (
              <ActionButton action={archiveCampaignAction.bind(null, id, true)} success="Archived"><Archive className="size-3.5" /> Archive</ActionButton>
            ))}
            {can(viewer, "DELETE_CAMPAIGNS") && (
              <ActionButton variant="destructive" action={deleteCampaignAction.bind(null, id)} success="Campaign deleted" redirectTo="/viralpulse-ai/campaigns" confirm={{ title: "Delete this campaign?", description: `“${c.name}” and its ${ads.length} ad(s) will be removed. Generated media stays in the library.`, confirmLabel: "Delete" }} aria-label="Delete campaign">
                <Trash2 className="size-3.5" />
              </ActionButton>
            )}
          </>
        }
      />
      {c.status === "archived" && <Notice tone="warn">This campaign is archived — restore it to edit, generate or add ads.</Notice>}

      <Tabs defaultValue={isMetaCampaign ? "overview" : hasAi ? "strategy" : "brief"}>
        <TabsList>
          {isMetaCampaign && <TabsTrigger value="overview">Overview</TabsTrigger>}
          {isMetaCampaign && <TabsTrigger value="structure">Structure</TabsTrigger>}
          {isMetaCampaign && <TabsTrigger value="launch">Launch</TabsTrigger>}
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="strategy">AI strategy</TabsTrigger>
          <TabsTrigger value="ads">{`Ads (${ads.length})`}</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="history">{`History (${versions.length})`}</TabsTrigger>
        </TabsList>


        {isMetaCampaign && (
          <TabsContent value="overview" className="mt-4 space-y-4">
            <SectionCard title="Status" description="From the launch record and what Meta last reported.">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{LIST_STATUS_LABEL[overall]}</span>
                <SourceBadge source={launch?.lastSyncAt ? "synced" : "estimate"} at={launch?.lastSyncAt} label={launch?.lastSyncAt ? "Synced from Meta" : "Not synced from Meta yet"} />
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                {([
                  ["Objective", draftMeta?.objective ? META_OBJECTIVE_LABEL[draftMeta.objective] : ""],
                  ["Ad sets", String(draftMeta?.adSets.length ?? 0)],
                  ["Ads", String(wiz?.state.ads.length ?? 0)],
                  ["Daily budget", launch ? formatMinor(launch.commitment.dailyMinor, launch.currency) : ""],
                  ["Total it can spend", launch ? (launch.commitment.totalMinor === null ? "No end date" : formatMinor(launch.commitment.totalMinor, launch.currency)) : ""],
                  ["Created in Meta", launch ? formatDateTime(launch.createdAt) : ""],
                ] as [string, string][]).map(([k, val]) => <div key={k}><dt className="text-[11px] font-semibold text-muted-foreground">{k}</dt><dd className="text-sm">{val || <span className="text-muted-foreground">-</span>}</dd></div>)}
              </dl>
              {!launch && <p className="mt-3 text-xs text-muted-foreground">This campaign is a draft. <Link className="underline" href={`/viralpulse-ai/campaigns/${id}/edit`}>Continue in the wizard.</Link></p>}
            </SectionCard>
            <SectionCard title="Performance" description={metaPerf ? `From Meta insights, ${metaPerf.from} to ${metaPerf.to} (${metaPerf.days} day${metaPerf.days === 1 ? "" : "s"} synced).` : "Results from Meta."}>
              {metaPerf ? (
                <div className="space-y-3">
                  <SourceBadge source="synced" at={metaPerf.capturedAt} label="Synced from Meta" />
                  <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {([["Spend", metaPerf.totals.spend !== undefined && metaPerf.currency ? new Intl.NumberFormat("en-IN", { style: "currency", currency: metaPerf.currency }).format(metaPerf.totals.spend) : null], ["Impressions", metaPerf.totals.impressions], ["Reach (sum of days)", metaPerf.totals.reach], ["Clicks", metaPerf.totals.clicks], ["Link clicks", metaPerf.totals.inline_link_clicks]] as [string, string | number | null | undefined][]).map(([k, val]) => <div key={k} className="rounded-xl border border-border/50 p-3"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="text-sm font-semibold tabular-nums">{val === null || val === undefined ? "Not reported" : typeof val === "number" ? Math.round(val).toLocaleString("en-IN") : val}</dd></div>)}
                  </dl>
                  {metaPerf.actions.length > 0 && <p className="text-xs text-muted-foreground">Actions Meta counted: {metaPerf.actions.map((a) => `${a.metric.replaceAll("_", " ")} ${Math.round(a.value).toLocaleString("en-IN")}`).join(", ")}.</p>}
                </div>
              ) : <p className="text-sm text-muted-foreground">Not synced yet. Results appear after the campaign has been created in Meta and its first sync has run.</p>}
            </SectionCard>
          </TabsContent>
        )}

        {isMetaCampaign && (
          <TabsContent value="structure" className="mt-4">
            <SectionCard title="Structure" description="Campaign, ad sets and ads as drafted, with their Meta ids and review status once created.">
              {!draftMeta || draftMeta.adSets.length === 0 ? <EmptyState title="Nothing built yet">Add ad sets and ads in the wizard.</EmptyState> : (
                <ul className="space-y-3 text-sm">
                  <li>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{draftMeta.objective ? META_OBJECTIVE_LABEL[draftMeta.objective] : "No objective"}{launch?.objects.campaign ? ` · Meta ${launch.objects.campaign}` : ""}</p>
                    {launch?.objects.campaign && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" target="_blank" rel="noreferrer" href={adsManagerUrl(launch.actId, "campaign", launch.objects.campaign)}>Ads Manager <ExternalLink className="size-3" /></a>}
                    <ul className="mt-2 space-y-3 border-l border-border/60 pl-4">
                      {draftMeta.adSets.map((set) => {
                        const ext = launch?.objects.adSets[set.key];
                        const rv = ext ? launch?.review[ext] : undefined;
                        return (
                          <li key={set.key}>
                            <p className="font-medium">{set.name || "Ad set"}</p>
                            <p className="text-xs text-muted-foreground">{[set.optimizationGoal ? goalLabel(set.optimizationGoal) : "No goal", set.destinationType ? (DESTINATION_LABEL[set.destinationType]?.label ?? set.destinationType) : null, set.budget ? `${set.budget.type} ${launch ? formatMinor(set.budget.amountMinor, launch.currency) : ""}` : null, ext ? `Meta ${ext}` : null, ext ? reviewLabel(rv?.effectiveStatus ?? null) : null].filter(Boolean).join(" · ")}</p>
                            <ul className="mt-1 space-y-1 border-l border-border/60 pl-4">
                              {(wiz?.state.ads ?? []).filter((a) => a.meta.adSetKey === set.key).map((a) => {
                                const aext = launch?.objects.ads[a.id ?? ""];
                                const ar = aext ? launch?.review[aext] : undefined;
                                return <li key={a.key} className="text-xs"><Link href={`/viralpulse-ai/campaigns/${id}/ads/${a.id}`} className="font-medium hover:text-primary">{a.name || "Ad"}</Link> <span className="text-muted-foreground">{[a.meta.creativeType, aext ? `Meta ${aext}` : null, aext ? reviewLabel(ar?.effectiveStatus ?? null) : null].filter(Boolean).join(" · ")}</span></li>;
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                </ul>
              )}
            </SectionCard>
          </TabsContent>
        )}

        {isMetaCampaign && (
          <TabsContent value="launch" className="mt-4">
            <SectionCard title="Launch" description="Approve, switch on, pause, edit, archive or roll back. Everything is recorded.">
              <LaunchHost campaignId={id} initial={launch} perms={{ canCreate: can(viewer, "CREATE_ADS") && can(viewer, "EDIT_CAMPAIGNS"), canApprove: can(viewer, "APPROVE_AD_SPEND"), canPublish: can(viewer, "PUBLISH_CONTENT"), canEdit: can(viewer, "EDIT_CAMPAIGNS"), userId: viewer.userId }} />
            </SectionCard>
          </TabsContent>
        )}

        <TabsContent value="brief" className="mt-4">
          <SectionCard title="Campaign brief" description="What the AI works from, together with the brand context in Settings.">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {brief.map(([k, val]) => (
                <div key={k} className={k === "Target audience" || k === "Brand information" ? "sm:col-span-2" : undefined}>
                  <dt className="text-[11px] font-semibold text-muted-foreground">{k}</dt>
                  <dd className="text-sm whitespace-pre-wrap">{val || <span className="text-muted-foreground">—</span>}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="strategy" className="mt-4 space-y-4">
          <GenerateBar
            hasContent={hasAi}
            label="Generate strategy with AI"
            generate={generateCampaignAction.bind(null, id)}
            disabled={!canEdit || !can(viewer, "GENERATE_AI_CONTENT") || !(await isOpenAIConfigured()) || c.status === "published"}
            disabledReason={!(await isOpenAIConfigured()) ? "OpenAI isn't connected for this workspace (Settings → Integrations)." : c.status === "published" ? "Launched campaigns keep their strategy — duplicate to plan a new version." : "You can read this strategy but not regenerate it."}
          />
          {hasAi && c.ai.adConcepts.length > 0 && (
            <SectionCard title="Ad concepts" description="Turn a concept into an ad draft, then generate its full creative.">
              <div className="grid gap-3 md:grid-cols-2">
                {c.ai.adConcepts.map((a, i) => (
                  <div key={i} className="rounded-xl border border-border/50 bg-background/50 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <PlatformChip platform={a.platform} />
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">{a.format === "video" ? <Film className="size-3" /> : <ImageIcon className="size-3" />}{a.format}</span>
                    </div>
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-sm">{a.headline}</p>
                    <p className="line-clamp-3 text-xs text-muted-foreground">{a.primaryText}</p>
                    {canAds && (
                      <div className="mt-2">
                        <ActionButton size="xs" action={createAdAction.bind(null, id, {}, i)} success="Ad draft created" redirectPrefix={`/viralpulse-ai/campaigns/${id}/ads/`}>
                          <Plus className="size-3" /> Create ad
                        </ActionButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {hasAi ? (
            <SectionCard title="Strategy" description="Edit anything — saving creates a new version.">
              <CampaignStrategyEditor key={versions[0]?._id ?? "none"} campaignId={id} ai={c.ai} canEdit={canEdit} campaign={campaignBriefContext(c)} canGenerate={can(viewer, "GENERATE_AI_CONTENT") && (await isOpenAIConfigured())} />
            </SectionCard>
          ) : (
            <EmptyState title="No strategy yet">Generate one from the brief — you&apos;ll get a strategy, ideas, audiences, keywords, hashtags and ad concepts per platform.</EmptyState>
          )}
        </TabsContent>

        <TabsContent value="ads" className="mt-4 space-y-4">
          {canAds && (
            <SectionCard title="New ad" description="One platform and format per ad. Duplicate an ad to adapt it for another platform.">
              <NewAdForm campaignId={id} platforms={c.platforms} campaign={campaignBriefContext(c)} canGenerate={can(viewer, "GENERATE_AI_CONTENT") && (await isOpenAIConfigured())} />
            </SectionCard>
          )}
          <SectionCard title="Ads">
            {ads.length === 0 ? (
              <EmptyState title="No ads yet">Create one above or from an AI ad concept.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ads.map((a) => {
                  const t = thumbs.get(a.format === "video" ? (a.thumbnailId ?? a.mediaIds[0] ?? "") : (a.mediaIds[0] ?? ""));
                  const fmt = findFormat(a.platform, a.formatKey);
                  return (
                    <Link key={a._id} href={`/viralpulse-ai/campaigns/${id}/ads/${a._id}`} className="group flex gap-3 rounded-xl border border-border/50 bg-background/50 p-3 transition hover:border-primary/40">
                      {t ? <MediaThumb media={t} className="size-16 shrink-0" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">{a.format === "video" ? <Film className="size-5 text-muted-foreground" /> : <ImageIcon className="size-5 text-muted-foreground" />}</div>}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold group-hover:text-primary">{a.name}</p>
                        <div className="my-1 flex flex-wrap items-center gap-1"><PlatformChip platform={a.platform} /><StatusBadge status={a.status} /></div>
                        <p className="truncate text-[11px] text-muted-foreground">{`${a.format === "video" ? "Video" : "Image"} ad${fmt ? ` · ${fmt.width}×${fmt.height}` : ""}${a.content.headline ? ` · ${a.content.headline}` : ""}`}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="performance" className="mt-4 space-y-4">
          <SectionCard title="Linked ad-platform data" description="Spend and results live in DealFlow → Campaigns (CSV imports from Meta, Google and LinkedIn). Link the imported campaigns that belong to this one.">
            {can(viewer, "EDIT_CAMPAIGNS") ? (
              <LmsLinker options={lmsOptions.map((o) => ({ key: o.key, name: o.name, platform: o.platform }))} selected={c.lmsCampaignKeys} save={linkLmsCampaignsAction.bind(null, id)} />
            ) : (
              <p className="text-sm text-muted-foreground">{`${c.lmsCampaignKeys.length} linked DealFlow campaign(s).`}</p>
            )}
          </SectionCard>
          <SectionCard title="Performance" description={perf.rows.length ? `${formatCurrency(perf.totals.spend, perf.totals.currency)} spent · ${perf.totals.impressions.toLocaleString("en-IN")} impressions · ${perf.totals.clicks.toLocaleString("en-IN")} clicks · ${perf.totals.leads} leads` : "No imported results for the linked campaigns yet."}>
            {perf.rows.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>DealFlow campaign</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Conv.</TableHead><TableHead className="text-right">CPL</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {perf.rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>{r.name} <span className="text-[11px] text-muted-foreground uppercase">{r.platform}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.spend, r.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.impressions.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.clicks.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.ctr === null ? "—" : `${r.ctr}%`}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.leadsAttributed}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.cpl === null ? "—" : formatCurrency(r.cpl, r.currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.roas === null ? "—" : `${r.roas}×`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SectionCard title="Strategy versions" description="Every AI generation and every saved edit. Restoring creates a new version.">
            <VersionHistory targetType="campaign" targetId={id} versions={versions} canRestore={canEdit} />
          </SectionCard>
        </TabsContent>
      </Tabs>
      <p className="text-[11px] text-muted-foreground">{isMetaCampaign ? "Nothing spends until an approver approves the budget and someone switches the campaign on. Facebook and Instagram campaigns launch through Meta's API from the wizard; other platforms are launched by hand in their own ads manager." : `Launch these by hand in the platform's ads manager (${c.platforms.map((p) => PLATFORM_META[p].label).join(", ")}). ViralPulse never spends on ads by itself.`}</p>
    </div>
  );
}
