/** The party model's shapes and names. Client-safe: no database, no server-only imports. */

export const PARTY_TYPES = ["client", "vendor", "employee", "candidate", "partner", "freelancer", "trainee", "other"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  client: "Client",
  vendor: "Vendor",
  employee: "Employee",
  candidate: "Candidate",
  partner: "Partner",
  freelancer: "Freelancer",
  trainee: "Trainee",
  other: "Other",
};

/** Types whose record lives in another product: the party only LINKS to it. */
export const LINKED_PARTY_TYPES = ["client", "vendor", "employee", "candidate"] as const;
export type LinkedPartyType = (typeof LINKED_PARTY_TYPES)[number];

/** Types ContractFlow keeps itself (a thin record with a name and optional contact). */
export const MANUAL_PARTY_TYPES = ["partner", "freelancer", "trainee", "other"] as const;
export type ManualPartyType = (typeof MANUAL_PARTY_TYPES)[number];

export const isLinkedType = (t: PartyType): t is LinkedPartyType => (LINKED_PARTY_TYPES as readonly string[]).includes(t);
export const isPartyType = (v: unknown): v is PartyType => typeof v === "string" && (PARTY_TYPES as readonly string[]).includes(v);

export interface PartyRecordRef {
  /** The product that owns the record. */
  product: "sprintos" | "spendiq" | "talentos";
  collection: string;
  id: string;
}

export type PartyStatus = "active" | "source_missing" | "archived";

/**
 * `cf_parties`: a thin index. For a linked party only the reference (and the last name seen, kept so a deleted source is still readable in
 * the vault) is stored; contact details are read from the source each time. A manual party owns its own name and contact.
 */
export interface PartyDoc {
  _id: string;
  type: PartyType;
  source: PartyRecordRef | null;
  displayName: string;
  /** Manual parties only. Always null for a linked party (link, not copy). */
  contact: { email: string | null; phone: string | null } | null;
  status: PartyStatus;
  searchKey: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** When the source record was last found; set for linked parties. */
  lastResolvedAt: Date | null;
}

export interface PartyView {
  id: string;
  type: PartyType;
  displayName: string;
  status: PartyStatus;
  linked: boolean;
  source: PartyRecordRef | null;
  email: string | null;
  phone: string | null;
  subtitle: string | null;
  /** True when the record in the other product was deleted or archived: the name shown is the last one seen. */
  sourceMissing: boolean;
}

export interface PickerHit {
  type: PartyType;
  /** The source record id for a linked type, or the party id for a manual one. */
  recordId: string;
  displayName: string;
  subtitle: string | null;
  /** The cf_parties id when this record is already in the index. */
  partyId: string | null;
}
