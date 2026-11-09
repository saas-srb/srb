"use client";

import ItemsTable from "@/components/products/playbook-ai/items/ItemsTable";
import CloneTable, { type CloneRow } from "@/components/products/contractflow-ai/CloneTable";
import type { ItemRow } from "@/lib/products/playbook-ai/items-types";

const at = "2026-11-09T09:30:00.000Z";
const rows: ItemRow[] = [
  { id: "d1", title: "Recruitment and Selection", kind: "sop", department: "Human Resources", designation: "", status: "draft", updatedAt: at, updatedBy: "Priya Nair", versionCount: 0, send: null },
  { id: "d2", title: "Employee Onboarding", kind: "sop", department: "Human Resources", designation: "", status: "draft", updatedAt: at, updatedBy: "Vijay Pal", versionCount: 2, send: { cloneId: "c1", state: "sent", partyName: "Asha Rao", at, copies: 1 } },
  { id: "d3", title: "Expense Reimbursement", kind: "sop", department: "Finance", designation: "", status: "draft", updatedAt: at, updatedBy: "Vijay Pal", versionCount: 1, send: { cloneId: "c2", state: "signed", partyName: "Northwind Demo", at, copies: 2 } },
];
const clones: CloneRow[] = [
  { id: "c1", title: "Employee Onboarding", kind: "sop", state: "clone_draft", partyName: "Asha Rao", partyType: "employee", partyId: null, updatedAt: at, requestId: null, signerPlan: [], canEdit: true, canSend: true, canVoid: false, canDelete: true, replaces: false },
  { id: "c2", title: "Master Services Agreement", kind: "document", state: "sent", partyName: "Northwind Demo", partyType: "client", partyId: null, updatedAt: at, requestId: "r1", signerPlan: [], canEdit: false, canSend: true, canVoid: true, canDelete: false, replaces: false },
  { id: "c3", title: "Offer letter", kind: "document", state: "signed", partyName: "Ravi Menon", partyType: "employee", partyId: null, updatedAt: at, requestId: "r2", signerPlan: [], canEdit: false, canSend: false, canVoid: false, canDelete: false, replaces: true },
];

export default function ListsHarness() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">My SOPs</h1>
      <ItemsTable rows={rows} kind="sop" canSend canEdit canExport canDelete emptyText="Nothing here" />
      <h1 className="text-xl font-semibold">ContractFlow documents</h1>
      <CloneTable rows={clones} emptyText="Nothing here" />
    </div>
  );
}
