"use client";

import { useTransition } from "react";
import { Hash, Lock, Users, Archive, LogOut, Loader2, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { archiveChannelAction, removeChannelMemberAction } from "@/app/(products)/huddle-ai/(protected)/channels/actions";
import StartCallButtons from "@/components/products/huddle-ai/call/StartCallButtons";
import { useRouter } from "next/navigation";

export default function ChannelHeader({
  channel,
  isMember,
  canModerate,
  currentUserId,
  browseHref = "/huddle-ai/channels",
}: {
  channel: {
    _id: string;
    name: string;
    slug: string;
    description: string | null;
    topic: string | null;
    visibility: "public" | "private";
    archived: boolean;
    memberCount: number;
    kind?: "team" | "project" | "group";
  };
  isMember: boolean;
  canModerate: boolean;
  currentUserId?: string;
  browseHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isProject = channel.kind === "project";

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
      <div className="flex min-w-0 items-center gap-2">
        {isProject ? (
          <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        ) : channel.visibility === "private" ? (
          <Lock className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Hash className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {channel.name}
            {channel.archived && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(archived)</span>}
          </p>
          {(channel.topic || channel.description) && (
            <p className="truncate text-[11px] text-muted-foreground">{channel.topic ?? channel.description}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
          <Users className="size-3" />
          {channel.memberCount}
        </span>
        {(isMember || canModerate) && !channel.archived && (
          <StartCallButtons scope={{ type: "channel", id: channel._id }} />
        )}
        {(isMember || canModerate) && !isProject && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Channel options">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <span className="text-lg leading-none">⋯</span>}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              {canModerate && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      startTransition(async () => {
                        await archiveChannelAction(channel._id, !channel.archived);
                        router.refresh();
                      })
                    }
                  >
                    <Archive className="size-3.5" data-icon="inline-start" />
                    {channel.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {isMember && currentUserId && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    startTransition(async () => {
                      await removeChannelMemberAction(channel._id, currentUserId);
                      router.push(browseHref);
                    })
                  }
                >
                  <LogOut className="size-3.5" data-icon="inline-start" />
                  Leave
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isProject && (
          <span className="hidden rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
            Synced from SprintOS
          </span>
        )}
      </div>
    </div>
  );
}
