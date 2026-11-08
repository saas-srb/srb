"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, GraduationCap, FolderKanban, Check } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkStudentAction, linkClientAction } from "../actions";

/**
 * Bridge a lead to its deep ERP record. Once linked, the portal's batch /
 * attendance / assignments (TMS) or milestones / meetings / invoices (PMS)
 * widgets light up for that person.
 */
export default function LeadLinksPanel({
  leadId,
  type,
  studentId,
  clientId,
  projectId,
}: {
  leadId: string;
  type: string;
  studentId: string | null;
  clientId: string | null;
  projectId: string | null;
}) {
  const [pending, start] = useTransition();
  const [sid, setSid] = useState("");
  const [cid, setCid] = useState("");
  const [pid, setPid] = useState("");

  const isLearner = type === "intern" || type === "trainee";
  const isClient = type === "client";
  if (!isLearner && !isClient) return null;

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" /> ERP links
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLearner && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
              <GraduationCap className="size-4" /> Cohort AI student
            </p>
            {studentId ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="size-4 text-green-500" /> Linked — <code className="text-xs">{studentId}</code>
              </p>
            ) : (
              <div className="flex gap-2">
                <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="training_students _id" className="h-8" />
                <Button
                  size="sm"
                  disabled={pending || !sid.trim()}
                  onClick={() =>
                    start(async () => {
                      const r = await linkStudentAction(leadId, sid);
                      if (r.error) toast.error(r.error);
                      else toast.success("Student linked.");
                    })
                  }
                >
                  Link
                </Button>
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Create the student first from{" "}
              <a href="/cohort-ai/students" className="text-primary hover:underline">
                Cohort AI → Students
              </a>
              , then paste its id.
            </p>
          </div>
        )}

        {isClient && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
              <FolderKanban className="size-4" /> SprintOS client &amp; project
            </p>
            {clientId ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="size-4 text-green-500" /> Linked client <code className="text-xs">{clientId}</code>
                {projectId ? (
                  <>
                    {" "}
                    · project <code className="text-xs">{projectId}</code>
                  </>
                ) : null}
              </p>
            ) : (
              <div className="space-y-2">
                <Input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="pms_clients _id" className="h-8" />
                <Input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="pms_projects _id (optional)" className="h-8" />
                <Button
                  size="sm"
                  disabled={pending || !cid.trim()}
                  onClick={() =>
                    start(async () => {
                      const r = await linkClientAction(leadId, cid, pid);
                      if (r.error) toast.error(r.error);
                      else toast.success("Client linked.");
                    })
                  }
                >
                  Link
                </Button>
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Create the client / project in{" "}
              <a href="/sprintos/clients" className="text-primary hover:underline">
                SprintOS
              </a>
              , then paste the ids.
            </p>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
