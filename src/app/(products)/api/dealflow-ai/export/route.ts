import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { CATEGORIES, exportLeads, isValidCategory, getCategoryLabel, isValidLeadStatus, type CategorySlug, type Lead } from "@/lib/leads";
import { toCsv } from "@/lib/csv";

function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handleGET(req: NextRequest) {
  const lmsUser = await requireLms("EXPORT_DATA");
  if (!lmsUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const categoryParam = sp.get("category") ?? "all";
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const source = sp.get("source") ?? undefined;
  const dateFrom = parseDateParam(sp.get("dateFrom"));
  const dateTo = parseDateParam(sp.get("dateTo"), true);
  const sortBy = sp.get("sortBy") === "name" ? "name" : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const categories: CategorySlug[] =
    categoryParam === "all"
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
    source,
    dateFrom,
    dateTo,
    sortBy: sortBy as "createdAt" | "name",
    sortDir: sortDir as "asc" | "desc",
    ids,
  };

  const results = await Promise.all(categories.map((category) => exportLeads(category, filterOpts)));
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
    { header: "Message", value: (r) => r.message ?? "" },
    { header: "Notes", value: (r) => r.notes ?? "" },
    { header: "Submitted At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `submissions-${categoryParam}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
