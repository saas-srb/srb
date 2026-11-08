"use client";

import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import SidebarBrand from "@/components/SidebarBrand";
import LmsSidebar from "@/components/products/dealflow-ai/LmsSidebar";
import SidebarProfileMenu from "@/components/products/dealflow-ai/SidebarProfileMenu";
import { useSidebarCollapse, SidebarProfileSlot } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { cn } from "@/lib/utils";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 68;

export default function LmsSidebarShell({
  userEmail,
  createdAt,
  lastLoginAt,
}: {
  userEmail: string;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const { collapsed, toggle, hydrated } = useSidebarCollapse();

  return (
    <motion.aside
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      initial={false}
      transition={hydrated ? { type: "spring", stiffness: 320, damping: 32 } : { duration: 0 }}
      className="lms-surface hidden shrink-0 flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md md:flex dark:bg-card/85"
    >
      <div
        className={cn(
          "sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/70 px-4 backdrop-blur-md dark:bg-card/60",
          collapsed ? "justify-center gap-1.5 px-2" : "justify-between"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <SidebarBrand collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/8 hover:text-primary"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <LmsSidebar collapsed={collapsed} />
      </div>

      <SidebarProfileSlot>
      <SidebarProfileMenu userEmail={userEmail} createdAt={createdAt} lastLoginAt={lastLoginAt} />
      </SidebarProfileSlot>
    </motion.aside>
  );
}
