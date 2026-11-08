"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getEmployeeStatusMeta } from "@/lib/products/talentos/employee-status";
import type { OrgNode } from "@/lib/products/talentos/hierarchy";

function Node({
  node,
  depth,
  titleFor,
  linkEmployees,
}: {
  node: OrgNode;
  depth: number;
  titleFor: (id: string | null) => string;
  linkEmployees: boolean;
}) {
  const [open, setOpen] = useState(depth < 2);
  const meta = getEmployeeStatusMeta(node.status);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-muted/50" style={{ marginLeft: depth * 16 }}>
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-foreground" aria-label={open ? "Collapse" : "Expand"}>
            <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="inline-block size-4" />
        )}
        <span className={`size-2 shrink-0 rounded-full ${meta.dotClass}`} />
        {linkEmployees ? (
          <Link href={`/talentos/employees/${node.id}`} className="text-sm font-medium hover:underline">
            {node.name}
          </Link>
        ) : (
          <span className="text-sm font-medium">{node.name}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {titleFor(node.title)} · {node.code}
        </span>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} titleFor={titleFor} linkEmployees={linkEmployees} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTree({
  roots,
  designations,
  linkEmployees = true,
}: {
  roots: OrgNode[];
  designations: { _id: string; title: string }[];
  /** When false, names render as plain text (employees can't open staff profiles). */
  linkEmployees?: boolean;
}) {
  const titleFor = (id: string | null) => designations.find((d) => d._id === id)?.title ?? "—";

  if (roots.length === 0) {
    return <p className="text-sm text-muted-foreground">No employees to chart yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {roots.map((r) => (
        <Node key={r.id} node={r} depth={0} titleFor={titleFor} linkEmployees={linkEmployees} />
      ))}
    </div>
  );
}
