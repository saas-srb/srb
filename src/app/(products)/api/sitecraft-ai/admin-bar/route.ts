import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getCurrentCmsUser } from "@/lib/cms-auth";
import { primaryCmsRoleLabel } from "@/lib/cms-roles";
import { getPageByPath } from "@/lib/products/sitecraft-ai/pages";
import { getActiveThemeKey, getTheme } from "@/lib/products/sitecraft-ai/theme";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";

export const dynamic = "force-dynamic";

export interface AdminBarData {
  email: string;
  role: string;
  theme: { key: string; name: string };
  page: { id: string; title: string; status: string; pending: boolean } | null;
  record: { collection: string; label: string; slug: string } | null;
  can: { editPages: boolean; createPages: boolean; customize: boolean };
}

/** The public site's CMS admin toolbar: who's signed in and what they can edit on the page they're looking at. */
async function handleGET(request: Request) {
  const [viewer, user] = await Promise.all([getViewer(), getCurrentCmsUser()]);
  if (!viewer || !user || !can(viewer, "VIEW")) return new NextResponse(null, { status: 401 });

  const raw = new URL(request.url).searchParams.get("path") || "/";
  const path = raw.startsWith("/") ? raw.split("?")[0].replace(/\/+$/, "") || "/" : "/";

  const activeKey = await getActiveThemeKey();
  const [page, theme] = await Promise.all([getPageByPath(path), getTheme(activeKey).catch(() => null)]);

  // A blog post / job / hiring model's own page → its collection record too.
  let record: AdminBarData["record"] = null;
  for (const [key, def] of Object.entries(COLLECTIONS) as [CollectionKey, (typeof COLLECTIONS)[CollectionKey]][]) {
    if (!def.pathOf) continue;
    const prefix = def.pathOf("\u0000").split("\u0000")[0];
    if (prefix && path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes("/")) {
      record = { collection: key, label: def.singular ?? key, slug: path.slice(prefix.length) };
      break;
    }
  }

  const body: AdminBarData = {
    email: user.email,
    role: primaryCmsRoleLabel(user.roles),
    theme: { key: activeKey, name: theme?.name ?? "Default" },
    page: page ? { id: page._id, title: page.title, status: page.status, pending: !!page.hasUnpublishedChanges } : null,
    record,
    can: { editPages: can(viewer, "SECTIONS_EDIT"), createPages: can(viewer, "PAGES_CREATE"), customize: can(viewer, "THEME_UPDATE") },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withTransport(handleGET);
