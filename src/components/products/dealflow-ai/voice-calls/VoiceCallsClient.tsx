"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, Loader2, PhoneCall, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import { DealflowCallUnavailable } from "@/components/products/dealflow-ai/DealflowCallButton";
import ActiveCallsBar from "@/components/products/dealflow-ai/voice-calls/ActiveCallsBar";
import CallCard from "@/components/products/dealflow-ai/voice-calls/CallCard";
import CallDetailPanel from "@/components/products/dealflow-ai/voice-calls/CallDetailPanel";
import { loadActiveCallsAction, loadCallsAction, loadPeopleAction, loadPersonAction } from "@/app/(products)/dealflow-ai/(protected)/voice-calls/actions";
import {
  PANEL_CATEGORIES, formatIst, type PanelActiveCall, type PanelCall, type PanelFilter, type PanelPeoplePage, type PanelPerson, type PanelPersonView,
} from "@/lib/dealflow-ai/call-panel-types";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;
const FILTERS: { id: PanelFilter; label: string }[] = [{ id: "active", label: "Active now" }, { id: "all", label: "All" }, ...PANEL_CATEGORIES];

/**
 * AI Voice Calls: the people DealFlow has called (or can call) on the left, each call of the selected person as its own card on the right,
 * and the calls in progress across the top. A view over AgentOS calls; DealFlow owns no agents.
 */
export default function VoiceCallsClient({ initialPeople, initialActive, initialSelected }: { initialPeople: PanelPeoplePage; initialActive: PanelActiveCall[]; initialSelected?: string }) {
  const [filter, setFilter] = useState<PanelFilter>("all");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<PanelPerson[]>(initialPeople.people);
  const [total, setTotal] = useState(initialPeople.total);
  const [page, setPage] = useState(1);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [active, setActive] = useState<PanelActiveCall[]>(initialActive);

  const [selectedKey, setSelectedKey] = useState(initialSelected ?? "");
  const [person, setPerson] = useState<PanelPersonView | null>(null);
  const [calls, setCalls] = useState<PanelCall[]>([]);
  const [callsTotal, setCallsTotal] = useState(0);
  const [callsPage, setCallsPage] = useState(1);
  const [personBusy, setPersonBusy] = useState(false);
  const [personError, setPersonError] = useState("");
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  const query = useRef({ filter, search });
  const selected = useRef(selectedKey);
  useEffect(() => { query.current = { filter, search }; selected.current = selectedKey; });
  const listSeq = useRef(0);
  const personSeq = useRef(0);

  const loadList = useCallback(async (nextPage: number, replace: boolean) => {
    const seq = ++listSeq.current;
    setListBusy(true);
    try {
      const r = await loadPeopleAction({ q: query.current.search, filter: query.current.filter, page: nextPage });
      if (seq !== listSeq.current) return;
      if (!r) return void setListError("You don't have access to this list.");
      setListError("");
      setPeople((prev) => (replace ? r.people : [...prev, ...r.people.filter((p) => !prev.some((x) => x.key === p.key))]));
      setTotal(r.total);
      setPage(nextPage);
    } catch {
      if (seq === listSeq.current) setListError("Couldn't load the list. Check your connection.");
    } finally {
      if (seq === listSeq.current) setListBusy(false);
    }
  }, []);

  const loadPerson = useCallback(async (key: string, quiet = false) => {
    const seq = ++personSeq.current;
    if (!quiet) { setPersonBusy(true); setPersonError(""); }
    const i = key.indexOf(":");
    try {
      const r = i > 0 ? await loadPersonAction(key.slice(0, i), key.slice(i + 1)) : null;
      if (seq !== personSeq.current) return;
      if (!r) return void setPersonError("This person isn't available any more.");
      setPerson(r.person); setCalls(r.calls.calls); setCallsTotal(r.calls.total); setCallsPage(1); setPersonError("");
    } catch {
      if (seq === personSeq.current && !quiet) setPersonError("Couldn't load this person's calls. Check your connection.");
    } finally {
      if (seq === personSeq.current) setPersonBusy(false);
    }
  }, []);

  // Search and filter: reload the list from page 1 (search waits for a pause in typing).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void loadList(1, true), 250);
    return () => clearTimeout(t);
  }, [filter, search, loadList]);

  useEffect(() => {
    if (initialSelected) void Promise.resolve().then(() => loadPerson(initialSelected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active calls refresh every few seconds while the tab is visible; when the set changes (a call started or ended) the list and the open person reload.
  const sig = useRef(initialActive.map((c) => `${c.id}:${c.status}`).sort().join(","));
  const refreshActive = useCallback(async () => {
    try {
      const r = await loadActiveCallsAction();
      if (!r) return;
      setActive(r);
      const next = r.map((c) => `${c.id}:${c.status}`).sort().join(",");
      if (next !== sig.current) {
        sig.current = next;
        void loadList(1, true);
        if (selected.current) void loadPerson(selected.current, true);
      }
    } catch { /* the next tick tries again */ }
  }, [loadList, loadPerson]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refreshActive(), POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.visibilityState === "visible") { void refreshActive(); start(); } else stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [refreshActive]);

  function choose(key: string) {
    setSelectedKey(key); setPerson(null); setCalls([]); setCallsTotal(0); setOpenCallId(null);
    void loadPerson(key);
  }

  async function moreCalls() {
    if (!person) return;
    const r = await loadCallsAction(person.entityType, person.entityId, callsPage + 1).catch(() => null);
    if (!r) return;
    setCalls((prev) => [...prev, ...r.calls.filter((c) => !prev.some((x) => x.id === c.id))]);
    setCallsPage(r.page);
  }

  const openCall = useMemo(() => calls.find((c) => c.id === openCallId) ?? null, [calls, openCallId]);
  const activeLabel = `Active now${active.length ? ` (${active.length})` : ""}`;

  return (
    <div className="flex h-[calc(100vh-115px)] min-h-[600px] flex-col gap-3">
      <ActiveCallsBar calls={active} onChanged={() => void refreshActive()} onSelect={(c) => choose(`${c.entityType}:${c.entityId}`)} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div className="flex flex-wrap rounded-xl border border-border/60 bg-muted/30 p-1" role="tablist" aria-label="Filter people">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition-all", filter === f.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f.id === "active" ? activeLabel : f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or code" className="rounded-xl pl-9 text-xs" aria-label="Search people" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm md:col-span-4">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">People ({total})</div>
          <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto">
            {listError ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-destructive"><AlertCircle className="size-5" />{listError}<Button size="sm" variant="outline" onClick={() => void loadList(1, true)}>Try again</Button></div>
            ) : people.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {listBusy ? "Loading…" : search ? "No one matches your search." : filter === "active" ? "No call is in progress right now." : filter === "all" ? "No one has been called yet, and no lead has a phone number." : "No one in this pipeline has a call or a phone number."}
              </div>
            ) : (
              people.map((p) => (
                <button key={p.key} onClick={() => choose(p.key)} className={cn("flex w-full flex-col items-start gap-1 p-3.5 text-left transition-colors", p.key === selectedKey ? "border-l-4 border-l-primary bg-primary/10" : "hover:bg-muted/40")}>
                  <div className="flex w-full items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {p.activeCallId && <span className="relative flex size-2 shrink-0" title="A call is in progress"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /><span className="sr-only">Call in progress</span></span>}
                      <span className="truncate font-black text-foreground">{p.name}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums" title="Number of AI calls">{p.callCount} {p.callCount === 1 ? "call" : "calls"}</span>
                  </div>
                  <div className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                    {p.lastStatus ? <><CallStatusBadge status={p.lastStatus} /><span className="truncate">{formatIst(p.lastCallAt)}</span></> : <span>No AI call yet</span>}
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">{PANEL_CATEGORIES.find((c) => c.id === p.category)?.label}{p.phoneMasked ? ` · ${p.phoneMasked}` : " · No phone number"}</span>
                </button>
              ))
            )}
            {!listError && people.length < total && (
              <div className="p-3 text-center"><Button size="sm" variant="outline" disabled={listBusy} onClick={() => void loadList(page + 1, false)}>{listBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}Show more ({total - people.length} left)</Button></div>
            )}
          </div>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:col-span-8">
          {!selectedKey ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><PhoneCall className="size-8 opacity-30" />Select a person to see their AI calls, one by one.</div>
          ) : personError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-xs text-destructive"><AlertCircle className="size-6" />{personError}<Button size="sm" variant="outline" onClick={() => void loadPerson(selectedKey)}>Try again</Button></div>
          ) : !person ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading…</div>
          ) : openCall ? (
            <CallDetailPanel key={openCall.id} call={openCall} onBack={() => setOpenCallId(null)} />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 p-4">
                <div>
                  <h3 className="text-base font-black text-foreground">{person.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{PANEL_CATEGORIES.find((c) => c.id === person.category)?.label}{person.phoneMasked ? ` · ${person.phoneMasked}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {person.callSpec.unavailable ? (
                    <><DealflowCallUnavailable reason={person.callSpec.unavailable} /><span className="max-w-56 text-[11px] text-muted-foreground">{person.callSpec.unavailable}</span></>
                  ) : (
                    <CallWithAI key={person.key} target={person.callSpec.target} phone={person.callSpec.phone} context={person.callSpec.context} defaultPurpose={person.callSpec.defaultPurpose} variant="outline" size="sm" onPlaced={() => { void refreshActive(); void loadPerson(person.key, true); void loadList(1, true); }} />
                  )}
                  {person.recordHref && <Link href={person.recordHref} className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"><ExternalLink className="size-3" />Open record</Link>}
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/5 p-4">
                {personBusy && calls.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading…</div>
                ) : calls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground"><PhoneCall className="size-8 opacity-30" />No AI call with {person.name} yet.</div>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">{callsTotal} {callsTotal === 1 ? "call" : "calls"}, newest first. Each call is kept on its own; open one for its transcript and recording. Times are in IST.</p>
                    {calls.map((c) => <CallCard key={c.id} call={c} onOpen={() => setOpenCallId(c.id)} />)}
                    {calls.length < callsTotal && <div className="text-center"><Button size="sm" variant="outline" onClick={() => void moreCalls()}>Show older calls ({callsTotal - calls.length} left)</Button></div>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
