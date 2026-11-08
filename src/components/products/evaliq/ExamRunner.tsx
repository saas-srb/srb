"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Eraser, Send, Loader2, Maximize, ShieldAlert, Timer, CheckCircle2, CloudOff, Cloud, MonitorSmartphone, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuestionRenderer from "@/components/products/evaliq/QuestionRenderer";
import { sessionKey } from "@/components/products/evaliq/StartTestButton";
import { examStateAction, navigateAction, nextSectionAction, reportEventAction, saveAnswerAction, submitTestAction, takeOverAction } from "@/app/(products)/evaliq/take/actions";
import { cn } from "@/lib/utils";
import type { ExamState } from "@/lib/products/evaliq/attempts";
import type { QuestionResponse } from "@/lib/products/evaliq/question-types";
import type { Channel } from "@/lib/products/evaliq/taker";

type SaveState = "idle" | "saving" | "saved" | "error";
type Fail = { ok: false; error: string; code?: "SESSION" | "CLOSED" | "AUTH" };

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export default function ExamRunner({ channel, initial, resultsBase, testsBase }: { channel: Channel; initial: ExamState; resultsBase: string; testsBase: string }) {
  const router = useRouter();
  const [state, setState] = useState<ExamState>(initial);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [needsTakeover, setNeedsTakeover] = useState(false);
  const [responses, setResponses] = useState<Record<number, QuestionResponse | null>>(() => Object.fromEntries(initial.items.filter((i) => i.available).map((i) => [i.index, i.response ?? null])));
  const [flags, setFlags] = useState<Record<number, boolean>>(() => Object.fromEntries(initial.items.map((i) => [i.index, i.flagged])));
  const [visited, setVisited] = useState<Record<number, boolean>>(() => Object.fromEntries(initial.items.map((i) => [i.index, i.visited])));
  const [current, setCurrent] = useState<number>(() => {
    const first = initial.items.find((i) => i.available && i.index >= initial.cursor) ?? initial.items.find((i) => i.available);
    return first?.index ?? 0;
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [now, setNow] = useState(() => Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sectionConfirm, setSectionConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [violations, setViolations] = useState(initial.violations);
  const [fsOk, setFsOk] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  const offset = useRef(new Date(initial.serverNow).getTime() - Date.now());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const responsesRef = useRef(responses);
  const flagsRef = useRef(flags);
  const sessionRef = useRef<string | null>(null);
  const shownAt = useRef(Date.now());
  const submittingRef = useRef(false);
  const lastEvent = useRef<Map<string, number>>(new Map());
  const reloadingRef = useRef(false);
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  const handleFail = useCallback(
    (res: Fail) => {
      if (res.code === "SESSION") {
        setNeedsTakeover(true);
        return;
      }
      if (res.code === "CLOSED") {
        router.replace(`${resultsBase}/${state.attemptId}`);
        return;
      }
      toast.error(res.error);
    },
    [router, resultsBase, state.attemptId]
  );

  // ── session token (single window) ──
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(sessionKey(initial.attemptId));
    } catch {
      stored = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the window token lives in sessionStorage, which only exists client-side
    if (stored) setSessionId(stored);
    else if (!initial.singleSession) {
      takeOverAction(channel, initial.attemptId).then((res) => {
        if (res.ok) {
          setSessionId(res.sessionId);
          try {
            sessionStorage.setItem(sessionKey(initial.attemptId), res.sessionId);
          } catch {
            /* ignore */
          }
        } else handleFail(res);
      });
    } else setNeedsTakeover(true);
  }, [channel, initial.attemptId, initial.singleSession, handleFail]);

  async function takeOver() {
    const res = await takeOverAction(channel, state.attemptId);
    if (!res.ok) return handleFail(res);
    try {
      sessionStorage.setItem(sessionKey(state.attemptId), res.sessionId);
    } catch {
      /* ignore */
    }
    setSessionId(res.sessionId);
    setNeedsTakeover(false);
    await reload();
  }

  // ── clock ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const serverNow = now + offset.current;
  const hardDeadline = state.deadlineAt ? new Date(state.deadlineAt).getTime() : null;
  const softDeadline = state.softDeadlineAt ? new Date(state.softDeadlineAt).getTime() : null;
  const sectionDeadline = state.sectionMode === "sequential" && state.sections[state.currentSection]?.deadlineAt ? new Date(state.sections[state.currentSection].deadlineAt!).getTime() : null;
  const remaining = hardDeadline !== null ? hardDeadline - serverNow : softDeadline !== null ? softDeadline - serverNow : null;
  const sectionRemaining = sectionDeadline !== null && (hardDeadline === null || sectionDeadline < hardDeadline) ? sectionDeadline - serverNow : null;

  // ── saving ──
  const doSave = useCallback(
    async (index: number) => {
      const sid = sessionRef.current;
      if (!sid) return;
      timers.current.delete(index);
      setSaveState("saving");
      const delta = index === current ? Date.now() - shownAt.current : 0;
      if (index === current) shownAt.current = Date.now();
      const res = await saveAnswerAction(channel, state.attemptId, sid, { index, response: responsesRef.current[index] ?? null, flagged: !!flagsRef.current[index], timeMs: delta, clear: responsesRef.current[index] === null });
      if (res.ok) setSaveState("saved");
      else {
        setSaveState("error");
        handleFail(res);
      }
    },
    [channel, state.attemptId, current, handleFail]
  );

  const schedule = useCallback(
    (index: number, delay = 600) => {
      const old = timers.current.get(index);
      if (old) clearTimeout(old);
      timers.current.set(
        index,
        setTimeout(() => {
          void doSave(index);
        }, delay)
      );
    },
    [doSave]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  async function flush() {
    const pending = Array.from(timers.current.keys());
    for (const i of pending) {
      clearTimeout(timers.current.get(i)!);
      await doSave(i);
    }
  }

  // Warn before closing with unsaved answers.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (timers.current.size > 0 || saveState === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [saveState]);

  // ── reload (section changes / expiry) ──
  const reload = useCallback(async () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    const res = await examStateAction(channel, state.attemptId);
    reloadingRef.current = false;
    if (!res.ok) return handleFail(res);
    const s = res.state;
    offset.current = new Date(s.serverNow).getTime() - Date.now();
    setState(s);
    setResponses((r) => ({ ...r, ...Object.fromEntries(s.items.filter((i) => i.available).map((i) => [i.index, i.response ?? null])) }));
    const first = s.items.find((i) => i.available && i.index >= s.cursor) ?? s.items.find((i) => i.available);
    if (first) setCurrent(first.index);
    shownAt.current = Date.now();
  }, [channel, state.attemptId, handleFail]);

  // ── submit ──
  const submit = useCallback(
    async (timedOut: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await flush();
      } catch {
        /* the server keeps whatever was saved */
      }
      const sid = sessionRef.current ?? "";
      const res = await submitTestAction(channel, state.attemptId, sid, timedOut);
      if (!res.ok && res.code !== "CLOSED") {
        submittingRef.current = false;
        setSubmitting(false);
        return handleFail(res);
      }
      try {
        sessionStorage.removeItem(sessionKey(state.attemptId));
      } catch {
        /* ignore */
      }
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      toast.success(timedOut ? "Time is up — your test was submitted." : "Test submitted.");
      router.replace(`${resultsBase}/${state.attemptId}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, state.attemptId, router, resultsBase, handleFail]
  );

  // Auto-submit when the hard deadline passes; move on when a section's own timer ends.
  const sectionAdvancing = useRef<number | null>(null);
  useEffect(() => {
    if (!sessionId || needsTakeover) return;
    if (hardDeadline !== null && remaining !== null && remaining <= 0) void submit(true);
    else if (sectionRemaining !== null && sectionRemaining <= 0 && sectionAdvancing.current !== state.currentSection) {
      sectionAdvancing.current = state.currentSection;
      toast.info("Time is up for this section — moving on.");
      void finishSection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, sectionRemaining, hardDeadline, sessionId, needsTakeover, submit, state.currentSection]);

  // ── proctoring ──
  const report = useCallback(
    async (type: string, detail = "") => {
      const sid = sessionRef.current;
      if (!sid) return;
      const last = lastEvent.current.get(type) ?? 0;
      if (Date.now() - last < 4000) return; // throttle bursts
      lastEvent.current.set(type, Date.now());
      const res = await reportEventAction(channel, state.attemptId, sid, type, detail);
      if (res.ok) {
        setViolations(res.violations);
        if (res.autoSubmitted) {
          toast.error("Too many security violations — your test was submitted.");
          router.replace(`${resultsBase}/${state.attemptId}`);
        }
      } else if (res.code === "CLOSED") router.replace(`${resultsBase}/${state.attemptId}`);
    },
    [channel, state.attemptId, router, resultsBase]
  );

  const sec = state.security;
  useEffect(() => {
    if (!sessionId) return;
    const onVis = () => {
      if (sec.detectTabSwitch && document.visibilityState === "hidden") void report("tab_hidden", "Tab hidden / minimised");
    };
    const onBlur = () => {
      if (sec.detectTabSwitch) void report("window_blur", "Window lost focus");
    };
    const block = (type: string) => (e: Event) => {
      e.preventDefault();
      void report(type);
      toast.warning("Copy and paste are disabled during this test.");
    };
    const onCopy = block("copy_attempt");
    const onPaste = block("paste_attempt");
    const onCut = block("cut_attempt");
    const onCtx = (e: Event) => {
      e.preventDefault();
      void report("context_menu");
    };
    const onFs = () => {
      if (!sec.requireFullscreen) return;
      const inFs = !!document.fullscreenElement;
      setFsOk(inFs);
      if (!inFs) void report("fullscreen_exit", "Left full screen");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    if (sec.blockCopyPaste) {
      document.addEventListener("copy", onCopy);
      document.addEventListener("paste", onPaste);
      document.addEventListener("cut", onCut);
    }
    if (sec.blockRightClick) document.addEventListener("contextmenu", onCtx);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [sessionId, sec, report]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- document.fullscreenElement only exists client-side
    if (sec.requireFullscreen) setFsOk(!!document.fullscreenElement);
  }, [sec.requireFullscreen]);

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      setFsOk(true);
    } catch {
      toast.error("Your browser blocked full screen. Try again, or use a different browser.");
    }
  }

  // ── navigation ──
  const available = useMemo(() => state.items.filter((i) => i.available), [state.items]);
  const posInSection = available.findIndex((i) => i.index === current);
  const item = state.items[current];

  async function go(to: number) {
    if (to === current || !state.items[to]?.available) return;
    if (!state.allowBack && to < current) return;
    if (!state.allowNavigation && to > current + 1) return;
    const sid = sessionRef.current;
    if (!sid) return;
    const pendingSave = timers.current.get(current);
    if (pendingSave) {
      clearTimeout(pendingSave);
      await doSave(current);
    }
    const delta = Date.now() - shownAt.current;
    const from = current;
    setCurrent(to);
    setVisited((v) => ({ ...v, [to]: true }));
    shownAt.current = Date.now();
    setNavOpen(false);
    const res = await navigateAction(channel, state.attemptId, sid, { from, to, timeMs: delta });
    if (!res.ok) {
      setCurrent(from);
      handleFail(res);
    }
  }

  function onAnswer(r: QuestionResponse | null) {
    setResponses((x) => ({ ...x, [current]: r }));
    responsesRef.current = { ...responsesRef.current, [current]: r };
    setSaveState("idle");
    schedule(current);
  }

  function toggleFlag() {
    const next = !flags[current];
    setFlags((f) => ({ ...f, [current]: next }));
    flagsRef.current = { ...flagsRef.current, [current]: next };
    schedule(current, 0);
  }

  function clearAnswer() {
    onAnswer(null);
  }

  async function finishSection() {
    const sid = sessionRef.current;
    if (!sid) return;
    await flush();
    const res = await nextSectionAction(channel, state.attemptId, sid);
    setSectionConfirm(false);
    if (!res.ok) return handleFail(res);
    if (res.finished) {
      router.replace(`${resultsBase}/${state.attemptId}`);
      return;
    }
    await reload();
  }

  const counts = useMemo(() => {
    const scope = state.items;
    const answered = scope.filter((i) => (i.available ? !!responses[i.index] : i.answered)).length;
    const flagged = scope.filter((i) => flags[i.index]).length;
    return { total: scope.length, answered, unanswered: scope.length - answered, flagged };
  }, [state.items, responses, flags]);

  const lastSection = state.sectionMode !== "sequential" || !state.sections.some((s, i) => i > state.currentSection && !s.locked && s.count > 0);

  // ── gates ──
  if (needsTakeover)
    return (
      <Gate icon={<MonitorSmartphone className="size-6" />} title="This test is open in another window">
        <p>For security, a test can only be answered in one window or device at a time. Continue here to move the test to this window — the other window will stop saving. This is recorded.</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={testsBase} />}>
            Back to my tests
          </Button>
          <Button onClick={takeOver}>Continue in this window</Button>
        </div>
      </Gate>
    );
  if (!sessionId)
    return (
      <Gate icon={<Loader2 className="size-6 animate-spin" />} title="Loading your test…">
        <span />
      </Gate>
    );
  if (sec.requireFullscreen && !fsOk)
    return (
      <Gate icon={<Maximize className="size-6" />} title="Full screen required">
        <p>This test must be taken in full screen. Leaving full screen is recorded{sec.maxViolations ? ` and after ${sec.maxViolations} violations the test is submitted automatically` : ""}. The timer keeps running.</p>
        <Button onClick={enterFullscreen}>
          <Maximize className="size-4" /> Enter full screen
        </Button>
      </Gate>
    );

  const timeLow = remaining !== null && remaining < 60_000;
  return (
    <div className={cn("flex min-h-screen flex-col bg-canvas", sec.blockCopyPaste && "select-none")}>
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{state.testName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {`Attempt ${state.attemptNo}`}
              {state.sections.length > 1 && ` · ${state.sections[item?.section ?? 0]?.title ?? ""}`}
              {` · ${counts.answered}/${counts.total} answered`}
            </p>
          </div>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : saveState === "error" ? <CloudOff className="size-3.5 text-rose-500" /> : <Cloud className="size-3.5" />}
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : saveState === "saved" ? "Saved" : ""}
          </span>
          {violations > 0 && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400" title="Recorded security events">
              <ShieldAlert className="size-3.5" /> {sec.maxViolations ? `${violations}/${sec.maxViolations}` : violations}
            </span>
          )}
          {sectionRemaining !== null && (
            <span className={cn("flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-sm tabular-nums", sectionRemaining < 60_000 ? "bg-rose-500/15 text-rose-600" : "bg-muted text-foreground")} title="Section time left">
              <ListChecks className="size-4" /> {fmtClock(sectionRemaining)}
            </span>
          )}
          {remaining !== null && (
            <span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-lg font-bold tabular-nums", timeLow ? "animate-pulse bg-rose-500/15 text-rose-600" : "bg-primary/10 text-primary")} role="timer" aria-label="Time remaining">
              <Timer className="size-5" />
              {remaining < 0 && hardDeadline === null ? `+${fmtClock(-remaining)}` : fmtClock(remaining)}
            </span>
          )}
          <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setNavOpen((o) => !o)}>
            Questions
          </Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit
          </Button>
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${counts.total ? (counts.answered / counts.total) * 100 : 0}%` }} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="space-y-4">
          {remaining !== null && hardDeadline === null && remaining < 0 && (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">The suggested time is over. You can keep going — overtime is recorded.</p>
          )}
          {item?.available ? (
            <div className="rounded-3xl border border-border/40 bg-background/95 p-4 shadow-none sm:p-6 dark:bg-card/85">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-lg bg-primary/10 px-2 py-1 font-bold text-primary">{`Question ${current + 1} of ${counts.total}`}</span>
                <span>{item.typeLabel}</span>
                <span>{`· ${item.marks} mark${item.marks === 1 ? "" : "s"}`}</span>
                {!!item.negativeMarks && <span className="text-rose-500">{`· −${item.negativeMarks} if wrong`}</span>}
                {flags[current] && <span className="flex items-center gap-1 text-violet-600"><Flag className="size-3.5" /> Marked for review</span>}
              </div>
              <QuestionRenderer key={current} prompt={item.prompt ?? ""} media={item.media} view={item.view!} response={responses[current] ?? null} onChange={onAnswer} inputId={`exam-${current}`} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This question is not available.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => go(available[posInSection - 1]?.index ?? current)} disabled={!state.allowBack || posInSection <= 0}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            {state.allowReview && (
              <Button variant="outline" onClick={toggleFlag} className={flags[current] ? "border-violet-500/50 text-violet-600" : undefined}>
                <Flag className="size-4" /> {flags[current] ? "Unmark review" : "Mark for review"}
              </Button>
            )}
            <Button variant="ghost" onClick={clearAnswer} disabled={!responses[current]}>
              <Eraser className="size-4" /> Clear answer
            </Button>
            <div className="ml-auto flex gap-2">
              {posInSection < available.length - 1 ? (
                <Button onClick={() => go(available[posInSection + 1].index)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              ) : !lastSection ? (
                <Button onClick={() => setSectionConfirm(true)}>
                  Next section <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
                  <Send className="size-4" /> Submit test
                </Button>
              )}
            </div>
          </div>
        </main>

        <aside className={cn("space-y-3 self-start lg:sticky lg:top-24 lg:block", navOpen ? "block" : "hidden")}>
          <div className="rounded-3xl border border-border/40 bg-background/95 p-4 dark:bg-card/85">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Question navigator</p>
            {state.sections.map((s, si) => {
              const list = state.items.filter((i) => i.section === si);
              if (list.length === 0) return null;
              return (
                <div key={si} className="mb-3">
                  {state.sections.length > 1 && <p className="mb-1 text-[11px] font-medium text-muted-foreground">{`${s.title}${s.locked ? " · locked" : ""}`}</p>}
                  <div className="grid grid-cols-6 gap-1.5">
                    {list.map((i) => {
                      const answered = i.available ? !!responses[i.index] : i.answered;
                      const isFlag = flags[i.index];
                      const seen = visited[i.index];
                      const disabled = !i.available || (!state.allowBack && i.index < current) || (!state.allowNavigation && i.index > current + 1);
                      return (
                        <button
                          key={i.index}
                          type="button"
                          onClick={() => go(i.index)}
                          disabled={disabled}
                          aria-label={`Question ${i.index + 1}${answered ? ", answered" : ""}${isFlag ? ", marked for review" : ""}`}
                          aria-current={i.index === current ? "step" : undefined}
                          className={cn(
                            "relative flex h-8 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            answered ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : seen ? "border-rose-400/50 bg-rose-500/10 text-rose-600" : "border-border/60 bg-muted/40 text-muted-foreground",
                            isFlag && "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300",
                            i.index === current && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                          )}
                        >
                          {i.index + 1}
                          {isFlag && answered && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-emerald-500/50 bg-emerald-500/15" /> Answered</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-rose-400/50 bg-rose-500/10" /> Not answered</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-violet-500 bg-violet-500/15" /> For review</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-border/60 bg-muted/40" /> Not visited</li>
              <li className="col-span-2 flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-primary" /> Current question</li>
            </ul>
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">Answers save automatically. The timer is kept on the server — closing this page does not pause it.</p>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit test?</DialogTitle>
            <DialogDescription>{counts.unanswered > 0 ? "You still have unanswered questions. Are you sure you want to submit?" : counts.flagged > 0 ? "Some questions are marked for review. Are you sure you want to submit?" : "You have answered every question. Once submitted, answers cannot be changed."}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 py-2">
              <p className="text-xl font-bold text-emerald-600">{counts.answered}</p>
              <p className="text-[11px] text-muted-foreground">Answered</p>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 py-2">
              <p className="text-xl font-bold text-rose-600">{counts.unanswered}</p>
              <p className="text-[11px] text-muted-foreground">Unanswered</p>
            </div>
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 py-2">
              <p className="text-xl font-bold text-violet-600">{counts.flagged}</p>
              <p className="text-[11px] text-muted-foreground">Marked for review</p>
            </div>
            <div className="rounded-xl border border-border/50 py-2">
              <p className="text-xl font-bold">{counts.total}</p>
              <p className="text-[11px] text-muted-foreground">Total questions</p>
            </div>
          </div>
          {state.sectionMode === "sequential" && !lastSection && <p className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Later sections have not been attempted yet — they will count as unanswered.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void submit(false);
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Submit test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sectionConfirm} onOpenChange={setSectionConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish this section?</DialogTitle>
            <DialogDescription>You cannot come back to this section once you move on. The next section&apos;s timer starts immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionConfirm(false)}>
              Stay here
            </Button>
            <Button onClick={finishSection}>Go to next section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Gate({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-border/40 bg-background/95 p-6 text-center dark:bg-card/85">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <h1 className="text-lg font-bold">{title}</h1>
        <div className="space-y-4 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
