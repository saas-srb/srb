import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { CATEGORIES, exportLeads, isValidCategory, getCategoryLabel, type CategorySlug, type Lead } from "@/lib/leads";
import { isValidLeadStatus } from "@/lib/lead-status";
import { toCsv } from "@/lib/csv";

function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.crm.leads");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const categoryParam = sp.get("category") ?? "all";
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const dateFrom = parseDateParam(sp.get("dateFrom"));
  const dateTo = parseDateParam(sp.get("dateTo"), true);
  const sortBy = sp.get("sortBy") === "name" ? "name" : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  // "category:id" pairs — a cross-category selection can span multiple collections.
  const idsParam = sp.get("ids");
  const idsByCategory = new Map<CategorySlug, string[]>();
  if (idsParam) {
    for (const pair of idsParam.split(",").filter(Boolean)) {
      const [category, id] = pair.split(":");
      if (!id || !isValidCategory(category)) continue;
      const list = idsByCategory.get(category) ?? [];
      list.push(id);
      idsByCategory.set(category, list);
    }
  }

  const categories: CategorySlug[] =
    idsByCategory.size > 0
      ? Array.from(idsByCategory.keys())
      : categoryParam === "all"
        ? CATEGORIES.map((c) => c.slug)
        : isValidCategory(categoryParam)
          ? [categoryParam]
          : [];

  if (categories.length === 0) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const filterOpts = {
    search,
    status: status && isValidLeadStatus(status) ? status : undefined,
    dateFrom,
    dateTo,
    sortBy: sortBy as "createdAt" | "name",
    sortDir: sortDir as "asc" | "desc",
  };

  const results = await Promise.all(
    categories.map((category) =>
      exportLeads(category, { ...filterOpts, ids: idsByCategory.get(category) })
    )
  );
  const rows: Lead[] = results.flat();
  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "name") return a.name.localeCompare(b.name) * dir;
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
  });

  const csv = toCsv(rows, [
    { header: "Name", value: (r) => r.name },
    { header: "Email", value: (r) => r.email ?? "" },
    { header: "Phone", value: (r) => r.phone },
    { header: "Category", value: (r) => getCategoryLabel(r.category) },
    { header: "Sub-Service", value: (r) => r.subService ?? "" },
    { header: "Status", value: (r) => r.status ?? "new" },
    { header: "Source", value: (r) => r.source ?? "" },
    { header: "Deal Value", value: (r) => r.dealValue ?? "" },
    { header: "Message", value: (r) => r.message ?? "" },
    { header: "Notes", value: (r) => r.notes ?? "" },
    { header: "Submitted At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
