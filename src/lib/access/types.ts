/** The two access levels. Write implies read. A missing entry means no access. */
export type Level = "read" | "write";

/** One person's access: { productKey: { featureKey: level } }. */
export type AccessMap = Record<string, Record<string, Level>>;

export interface CatalogueEntry {
  /** Stable feature key, `<role file>.<capability>`, e.g. `hrms.EMPLOYEE_MANAGE`. Never renamed. */
  key: string;
  /** Product slug (talentos, sprintos, ...). */
  product: string;
  /** Role file base name (hrms, pms, ...). */
  source: string;
  kind: "perm" | "pred" | "tier";
  fn: string;
  perm: string | null;
  overrideKey: string | null;
  /**
   * The level at which a person must hold this feature for the legacy capability to be true.
   * "read" = the capability only lets you see/open/use; "write" = it changes, sends, approves, publishes or reveals.
   */
  level: Level;
  label: string;
  description: string;
}
