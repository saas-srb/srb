"use client";

import { Fragment } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MenuEntry {
  label: string;
  onSelect?: () => void;
  /** Shown on the right, like Google Docs ("Ctrl+B"). */
  shortcut?: string;
  disabled?: boolean;
  /** A tick in front (the current mode, style or zoom). */
  checked?: boolean;
  /** A small heading above this entry instead of an action. */
  heading?: boolean;
  separatorBefore?: boolean;
}
export interface MenuGroup { label: string; entries: MenuEntry[] }

function Entries({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((e, i) => (
        <Fragment key={i}>
          {e.separatorBefore && <DropdownMenuSeparator />}
          {e.heading ? <DropdownMenuLabel>{e.label}</DropdownMenuLabel> : (
            <DropdownMenuItem disabled={e.disabled} onClick={e.onSelect} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-xs">{e.checked ? "✓" : ""}</span>
              <span className="flex-1">{e.label}</span>
              {e.shortcut && <span className="ml-6 text-xs text-muted-foreground">{e.shortcut}</span>}
            </DropdownMenuItem>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** File | Edit | View | Insert | Format | Tools | Help as real dropdown menus. Below the medium breakpoint they fold into one hamburger menu. */
export default function DocsMenuBar({ groups }: { groups: MenuGroup[] }) {
  return (
    <>
      <nav aria-label="Menu" className="hidden items-center gap-0.5 md:flex">
        {groups.map((g) => (
          <DropdownMenu key={g.label}>
            <DropdownMenuTrigger render={<button type="button" className={cn("rounded-md px-2 py-1 text-[13px] text-foreground/90 outline-none hover:bg-muted focus-visible:bg-muted aria-expanded:bg-muted")} />}>{g.label}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto"><Entries entries={g.entries} /></DropdownMenuContent>
          </DropdownMenu>
        ))}
      </nav>
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label="Menu" title="Menu" />}><Menu className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[75vh] w-64 overflow-y-auto">
            {groups.map((g, gi) => (
              <Fragment key={g.label}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                <Entries entries={g.entries.filter((e) => !e.heading)} />
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
