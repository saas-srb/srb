"use client";

import { useRouter } from "next/navigation";
import { AudioLines, ChevronDown, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** "Create agent" entry: a Text agent or a Voice agent (same form, different `kind`). */
export default function CreateAgentMenu() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" />}>
        <Plus className="size-4" /> Create agent <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => router.push("/agentos/bots/new?kind=text")}>
          <MessageSquareText className="size-4" /> Text agent
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/agentos/bots/new?kind=voice")}>
          <AudioLines className="size-4" /> Voice agent
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
