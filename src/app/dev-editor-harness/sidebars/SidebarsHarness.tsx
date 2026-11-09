"use client";

import SopSidebar from "@/components/products/playbook-ai/SopSidebar";
import LpmsSidebar from "@/components/products/contractflow-ai/LpmsSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const pb = { mySops: true, templates: true, compliance: true, reports: true, audit: true, settings: true, documents: true, brand: true, create: true, templateLibrary: true, myTemplates: true, assignedOpen: 0 };
const cf = { canCreate: true, canManageTemplates: true, canManageMakers: true, canApprove: true, canSign: true, canViewAudit: true, canSettings: true, pendingApprovals: 0 };

export default function SidebarsHarness() {
  const box = "w-64 rounded-2xl border border-border/50 bg-card shadow-sm";
  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-wrap items-start gap-6 p-6">
        <div><p className="mb-2 text-xs font-semibold">Playbook</p><div className={box}><SopSidebar flags={pb} /></div></div>
        <div><p className="mb-2 text-xs font-semibold">Playbook, no create or brand rights</p><div className={box}><SopSidebar flags={{ ...pb, create: false, brand: false }} /></div></div>
        <div><p className="mb-2 text-xs font-semibold">Playbook, collapsed</p><div className="w-16 rounded-2xl border border-border/50 bg-card shadow-sm"><SopSidebar flags={pb} collapsed /></div></div>
        <div><p className="mb-2 text-xs font-semibold">ContractFlow</p><div className={box}><LpmsSidebar flags={cf} /></div></div>
        <div><p className="mb-2 text-xs font-semibold">ContractFlow, collapsed</p><div className="w-16 rounded-2xl border border-border/50 bg-card shadow-sm"><LpmsSidebar flags={cf} collapsed /></div></div>
      </div>
    </TooltipProvider>
  );
}
