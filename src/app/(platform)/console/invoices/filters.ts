import { isFinancialYear, istDayStart, type SaasInvoiceFilter } from "@/lib/platform/billing/invoices";
import type { InvoiceFilterValues } from "./InvoicesFilterBar";

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: Params, key: string): string {
  const v = sp instanceof URLSearchParams ? sp.get(key) : sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100) ?? "";
}

/** Query string → validated filter values, shared by the list page and the CSV export so they always agree. */
export function parseInvoiceFilters(sp: Params): { values: InvoiceFilterValues; filter: SaasInvoiceFilter; active: boolean } {
  const status = get(sp, "status");
  const kind = get(sp, "kind");
  const fy = get(sp, "fy");
  const from = get(sp, "from");
  const to = get(sp, "to");
  const values: InvoiceFilterValues = {
    q: get(sp, "q"),
    company: get(sp, "company"),
    status: ["paid", "unpaid", "void"].includes(status) ? status : "",
    kind: kind === "invoice" || kind === "credit_note" ? kind : "",
    fy: isFinancialYear(fy) ? fy : "",
    from: istDayStart(from) ? from : "",
    to: istDayStart(to) ? to : "",
  };
  const filter: SaasInvoiceFilter = {
    q: values.q || undefined,
    companyId: values.company || undefined,
    status: (values.status || undefined) as SaasInvoiceFilter["status"],
    kind: (values.kind || undefined) as SaasInvoiceFilter["kind"],
    fy: values.fy || undefined,
    from: values.from || undefined,
    to: values.to || undefined,
  };
  return { values, filter, active: Object.values(values).some(Boolean) };
}

export function filterQueryString(values: InvoiceFilterValues): string {
  const p = new URLSearchParams(Object.entries(values).filter(([, v]) => v));
  return p.size ? `?${p}` : "";
}
