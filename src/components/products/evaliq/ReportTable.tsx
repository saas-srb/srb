import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Report } from "@/lib/products/evaliq/analytics";

/** Renders any `Report` (column spec + rows). */
export default function ReportTable({ report }: { report: Report }) {
  if (report.rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No data for these filters yet.</p>;
  return (
    <div className="max-h-[65vh] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {report.columns.map((c) => (
              <TableHead key={c.key} className={c.numeric ? "text-right" : undefined}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.map((r, i) => (
            <TableRow key={i}>
              {report.columns.map((c) => {
                const v = r[c.key];
                return (
                  <TableCell key={c.key} className={c.numeric ? "text-right tabular-nums" : "max-w-xs truncate"}>
                    {v === null || v === undefined || v === "" ? <span className="text-muted-foreground">—</span> : String(v)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
