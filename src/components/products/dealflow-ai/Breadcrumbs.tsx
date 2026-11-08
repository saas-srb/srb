"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { usePanels } from "@/components/platform/PanelsProvider";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbItemData {
  label: string;
  href?: string;
  /** Product Registry key: the crumb then shows that product's short name (`label` is only the fallback). */
  panel?: string;
}

/** The product home a crumb points at (`/talentos`, `/cohort-ai/me`), or null — the crumb's text then comes from the Product Registry. */
const panelOf = (href: string | undefined) => href?.match(/^\/([a-z][a-z0-9-]*)(?:\/me)?\/?$/)?.[1] ?? null;

export default function Breadcrumbs({ items: given, showHome = true }: { items: BreadcrumbItemData[]; showHome?: boolean }) {
  const panels = usePanels();
  // The first crumb that names a product shows the registry's short name, so every page says the same thing.
  const items = given.map((item, i) => {
    const key = item.panel ?? (i === 0 ? panelOf(item.href) : null);
    return key && panels[key] ? { ...item, label: panels[key].shortName } : item;
  });
  return (
    <Breadcrumb className="mb-1.5">
      <BreadcrumbList className="gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const isFirst = showHome && i === 0;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage className="flex items-center gap-1 font-medium text-foreground">
                    {isFirst && <Home className="size-3.5" />}
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <Link href={item.href} className="flex items-center gap-1 hover:text-primary">
                        {isFirst && <Home className="size-3.5" />}
                        {item.label}
                      </Link>
                    }
                  />
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
