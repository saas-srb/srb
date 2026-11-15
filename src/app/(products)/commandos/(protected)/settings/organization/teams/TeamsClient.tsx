"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Users2 } from "lucide-react";
import { toast } from "sonner";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { Department, Team } from "@/lib/platform/organization";
import TeamSheet from "./TeamSheet";
import { deleteTeamAction } from "./actions";

export interface TeamWithDetails extends Team {
  memberCount: number;
  departmentName: string;
}

interface TeamsClientProps {
  teams: TeamWithDetails[];
  departments: Department[];
}

export default function TeamsClient({ teams, departments }: TeamsClientProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithDetails | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamWithDetails | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setEditingTeam(null);
    setSheetOpen(true);
  }

  function handleEdit(team: TeamWithDetails) {
    setEditingTeam(team);
    setSheetOpen(true);
  }

  function handleDeleteClick(team: TeamWithDetails) {
    if (team.memberCount > 0) {
      toast.error(`Cannot delete: ${team.memberCount} employee(s) are still assigned to this team.`);
      return;
    }
    setDeletingTeam(team);
  }

  function handleDeleteConfirm() {
    if (!deletingTeam) return;
    startTransition(async () => {
      const res = await deleteTeamAction(deletingTeam._id);
      if (!res.ok) {
        toast.error(res.error || "Failed to delete team.");
        return;
      }
      toast.success("Team deleted.");
      setDeletingTeam(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">All Teams</h2>
          <p className="text-sm text-muted-foreground">
            {teams.length} team{teams.length === 1 ? "" : "s"} configured across {departments.length} department{departments.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 size-4" />
          Add Team
        </Button>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <Users2 className="mx-auto mb-2 size-6 opacity-40" />
                    No teams found. Click &quot;Add Team&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                teams.map((team) => (
                  <TableRow key={team._id}>
                    <TableCell className="font-medium text-foreground">{team.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {team.departmentName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {team.leadEmployeeId || "—"}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <span className="tabular-nums">{team.memberCount}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(team)}
                          title={`Edit ${team.name}`}
                          disabled={pending}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteClick(team)}
                          title={`Delete ${team.name}`}
                          disabled={pending}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <TeamSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        team={editingTeam}
        departments={departments}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog open={Boolean(deletingTeam)} onOpenChange={(o) => !pending && !o && setDeletingTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingTeam?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this team? This action will soft-delete the team if no employees are assigned to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
