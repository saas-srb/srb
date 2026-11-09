/** Shapes of the Playbook-to-ContractFlow handoff (H1, H2). Pure and client-safe. */

export const HANDOFF_STATUSES = ["clone_draft", "ready", "sent", "viewed", "partially_signed", "signed", "declined", "expired", "voided"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  clone_draft: "Being prepared",
  ready: "Ready to send",
  sent: "Sent for signature",
  viewed: "Opened by a signer",
  partially_signed: "Partly signed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  voided: "Voided",
};

export interface HandoffSigner {
  name: string;
  role: string;
  order: number;
  status: string;
  at: Date | null;
}

/** `pb_handoffs`: one row per send. Playbook keeps ids and status only, never a second copy of the signed file. */
export interface HandoffRecord {
  _id: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  cloneId: string;
  partyType: string;
  partyName: string;
  sentBy: string;
  sentByName: string | null;
  sentAt: Date;
  status: HandoffStatus;
  statusAt: Date;
  statusLog: { status: HandoffStatus; at: Date; note: string | null }[];
  signers: HandoffSigner[];
  /** Set by sealing (B6): the signed copy exists and can be opened through the access-checked route. */
  sealed: { at: Date; sha256: string } | null;
}

export interface SendIssue {
  code: "permission" | "status" | "not_esignable" | "no_signature_blocks" | "placeholders" | "missing_values" | "legal_ack" | "no_snapshot" | "no_version" | "source_damaged";
  message: string;
}

export interface SendContext {
  documentId: string;
  title: string;
  versionNumber: number | null;
  docTypeName: string | null;
  eligible: boolean;
  issues: SendIssue[];
  /** From the template's catalogue row. */
  stampRule: "none" | "maybe" | "likely" | null;
  stampCategory: string | null;
  legalReview: boolean;
  defaultPartyType: string | null;
  notice: string;
}
