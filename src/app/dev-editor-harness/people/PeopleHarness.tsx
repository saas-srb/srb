"use client";

import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import PeopleGrid from "@/app/(products)/commandos/(protected)/users/PeopleGrid";
import PeopleFilters from "@/app/(products)/commandos/(protected)/users/PeopleFilters";
import PersonWizard from "@/components/products/commandos/people/PersonWizard";
import { Armchair, UserCheck, UserX, Users } from "lucide-react";
import type { PersonRow } from "@/lib/products/commandos/people-list";
import type { PersonValidation } from "@/lib/products/commandos/people";
import type { PersonDetails } from "@/lib/products/commandos/people-rules";
import type { AccessUiModel } from "@/lib/access/ui-model";
import type { AccessMap } from "@/lib/access/types";
import type { OrgOption } from "@/lib/platform/organization/rules";

export interface HarnessData {
  view: "list" | "step1" | "step2" | "step3" | "withheld";
  model: AccessUiModel;
  org: { departments: OrgOption[]; teams: OrgOption[]; designations: OrgOption[] };
  rows: PersonRow[];
  details: PersonDetails;
  picked: AccessMap;
  openProduct: string;
  validation: PersonValidation | null;
}

/** Development-only (404 in production): the real People & Access components over sample data, no sign-in and no database. */
export default function PeopleHarness({ data }: { data: HarnessData }) {
  const stub = {
    check: async () => data.validation as PersonValidation,
    create: async () => ({ ok: true, tempPassword: "Kq7-Vm2xPz4A" }),
    update: async () => ({ ok: true }),
  };
  if (data.view === "list") {
    return (
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 p-4">
        <PanelPageHeader title={<>People &amp; access</>} description={<>Everyone who can sign in, where they work, and which products and features they can use.</>} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="People" value={data.rows.length} accent icon={<Users className="size-4" />} />
          <KpiCard label="Can sign in" value={data.rows.filter((r) => r.status !== "suspended").length} icon={<UserCheck className="size-4" />} />
          <KpiCard label="Cannot sign in" value={data.rows.filter((r) => r.status === "suspended").length} tone="down" icon={<UserX className="size-4" />} />
          <KpiCard label="Seats used" value={`${data.rows.length} / 10`} icon={<Armchair className="size-4" />} />
        </div>
        <div className="min-w-0 max-w-full"><PeopleGrid rows={data.rows} total={data.rows.length} page={1} totalPages={1} sortBy="createdAt" sortDir="desc" currentAdminId="u0" isDirector filters={<PeopleFilters initial={{ search: "", status: "", department: "", team: "", designation: "", userType: "" }} org={data.org} />} /></div>
      </div>
    );
  }
  const step = data.view === "step1" ? 1 : data.view === "step2" ? 2 : 3;
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4">
      <PanelPageHeader title={<>Add a person</>} description={<>Three steps: their details, what they can use, and a final check before anything is created.</>} />
      <PersonWizard
        mode="create"
        initial={{ details: data.details, picked: data.picked, isDirector: false }}
        model={{ ...data.model }}
        org={data.org}
        actions={stub}
        startStep={step as 1 | 2 | 3}
        seatLine="Seats: 6 of 10 in use."
      />
      <input type="hidden" id="open-product" value={data.openProduct} readOnly />
    </div>
  );
}
