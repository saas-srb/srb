import type { OptionDef, StatusState, SupportConfig } from "@/lib/support/types";

/** Client-safe workflow helpers. */
// Reason about a status by its `state`, never by its key.
export const statusOf = (cfg: SupportConfig, key: string) => cfg.statuses.find((s) => s.key === key);
export const initialStatus = (cfg: SupportConfig) => (cfg.statuses.find((s) => s.initial) ?? cfg.statuses.find((s) => s.state === "open") ?? cfg.statuses[0]).key;
export const firstStatusIn = (cfg: SupportConfig, state: StatusState) => cfg.statuses.find((s) => s.state === state)?.key ?? initialStatus(cfg);
export const stateOf = (cfg: SupportConfig, key: string): StatusState => statusOf(cfg, key)?.state ?? "open";
export const labelOf = (list: OptionDef[], key: string | null) => (key ? (list.find((o) => o.key === key)?.label ?? key) : "—");
