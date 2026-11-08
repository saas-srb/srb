import type { PBDoc, ValidationIssue } from "@/lib/products/playbook-ai/doc/types";
import { isConflictError, type DocumentStore } from "@/components/doc-editor/core/store";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "invalid" | "readonly";

export type Snapshot = { ok: true; doc: PBDoc } | { ok: false; issues: ValidationIssue[] };

export interface AutosaveState {
  status: SaveStatus;
  /** The version the server last confirmed (what the next save is based on). */
  version: string;
  savedAt?: string;
  error?: string;
  issues?: ValidationIssue[];
  /** Consecutive failed automatic attempts. */
  failures: number;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realScheduler: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export interface AutosaveOptions {
  store: DocumentStore;
  documentId: string;
  baseVersion: string;
  debounceMs?: number;
  /** Automatic retries after a transient failure, with doubling delay. After that the user retries by hand. */
  maxAutoRetries?: number;
  retryBaseMs?: number;
  scheduler?: Scheduler;
  now?: () => string;
  onState?: (s: AutosaveState) => void;
}

/**
 * Debounced autosave with optimistic concurrency. It never overwrites: a CONFLICT stops all saving until the user reloads (adopting the
 * server's version) or abandons their edit. The latest snapshot is read lazily, at save time, so a burst of keystrokes costs one conversion.
 */
export class AutosaveController {
  private readonly o: Required<Omit<AutosaveOptions, "onState">> & { onState?: (s: AutosaveState) => void };
  private getSnapshot: (() => Snapshot) | null = null;
  private timer: unknown = null;
  private inflight: Promise<SaveOutcome> | null = null;
  private dirtyAgain = false;
  private disposed = false;
  state: AutosaveState;
  /** The last document that failed to reach the server, kept so "copy your changes" works after a conflict. */
  lastLocal: PBDoc | null = null;

  constructor(opts: AutosaveOptions) {
    this.o = {
      debounceMs: 1500, maxAutoRetries: 3, retryBaseMs: 2000, scheduler: realScheduler, now: () => new Date().toISOString(), ...opts,
    };
    this.state = { status: "idle", version: opts.baseVersion, failures: 0 };
  }

  private set(patch: Partial<AutosaveState>) {
    this.state = { ...this.state, ...patch };
    this.o.onState?.(this.state);
  }

  get isDirty() {
    return this.state.status === "dirty" || this.state.status === "saving" || this.state.status === "error" || this.state.status === "conflict" || this.state.status === "invalid";
  }

  /** Call on every document change. `snapshot` is invoked later, when a save actually happens. */
  change(snapshot: () => Snapshot): void {
    if (this.disposed || this.state.status === "readonly") return;
    this.getSnapshot = snapshot;
    if (this.state.status === "conflict") return; // keep editing locally, but nothing is sent
    if (this.inflight) this.dirtyAgain = true;
    else this.set({ status: "dirty", error: undefined, failures: 0 });
    this.schedule(this.o.debounceMs);
  }

  private schedule(ms: number) {
    if (this.timer) this.o.scheduler.clear(this.timer);
    this.timer = this.o.scheduler.set(() => { this.timer = null; void this.flush(); }, ms);
  }

  setReadonly(readonly: boolean) {
    if (this.timer) { this.o.scheduler.clear(this.timer); this.timer = null; }
    if (readonly) this.set({ status: "readonly" });
    else if (this.state.status === "readonly") this.set({ status: "idle" });
  }

  /** Saves now (used by Ctrl+S and before leaving). Resolves with what happened. */
  async flush(): Promise<SaveOutcome> {
    if (this.timer) { this.o.scheduler.clear(this.timer); this.timer = null; }
    if (this.disposed) return "noop";
    if (this.inflight) { await this.inflight; if (!this.dirtyAgain) return this.outcomeOf(); }
    if (this.state.status === "conflict") return "conflict";
    if (!this.getSnapshot || (this.state.status !== "dirty" && this.state.status !== "error" && this.state.status !== "invalid")) return "noop";
    const run = this.run();
    this.inflight = run;
    try { return await run; } finally { this.inflight = null; }
  }

  private outcomeOf(): SaveOutcome {
    switch (this.state.status) {
      case "saved": case "idle": return "saved";
      case "conflict": return "conflict";
      case "invalid": return "invalid";
      case "error": return "error";
      default: return "noop";
    }
  }

  private async run(): Promise<SaveOutcome> {
    const snap = this.getSnapshot!();
    this.dirtyAgain = false;
    if (!snap.ok) {
      this.set({ status: "invalid", issues: snap.issues });
      return "invalid";
    }
    this.lastLocal = snap.doc;
    this.set({ status: "saving", issues: undefined });
    try {
      const res = await this.o.store.save({ id: this.o.documentId, doc: snap.doc, baseVersion: this.state.version });
      if (this.disposed) return "saved";
      this.set({ version: res.version, savedAt: res.savedAt ?? this.o.now(), failures: 0, error: undefined });
      if (this.dirtyAgain) {
        this.set({ status: "dirty" });
        this.schedule(this.o.debounceMs);
        return "saved";
      }
      this.set({ status: "saved" });
      this.lastLocal = null;
      return "saved";
    } catch (e) {
      if (isConflictError(e)) {
        this.set({ status: "conflict", error: "Someone else changed this document." });
        return "conflict";
      }
      const failures = this.state.failures + 1;
      this.set({ status: "error", failures, error: e instanceof Error ? e.message : "The document could not be saved." });
      if (failures <= this.o.maxAutoRetries) this.schedule(this.o.retryBaseMs * 2 ** (failures - 1));
      return "error";
    }
  }

  /** After the user chose "reload": adopt the server's version. The caller replaces the editor content. */
  adoptServerVersion(version: string): void {
    if (this.timer) { this.o.scheduler.clear(this.timer); this.timer = null; }
    this.getSnapshot = null;
    this.dirtyAgain = false;
    this.lastLocal = null;
    this.set({ status: "idle", version, error: undefined, issues: undefined, failures: 0 });
  }

  /** Undo `dispose` (React strict mode runs effect cleanups and set-ups twice in development). */
  revive() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    if (this.timer) this.o.scheduler.clear(this.timer);
    this.timer = null;
  }
}

export type SaveOutcome = "saved" | "noop" | "conflict" | "error" | "invalid";
