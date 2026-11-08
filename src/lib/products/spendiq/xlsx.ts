import "server-only";
import ExcelJS from "exceljs";
import { getCompanyBrand } from "@/lib/platform/branding";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  /** Optional key/value block rendered above the table (used for report headers). */
  meta?: [string, string | number][];
}

/** Builds a formatted .xlsx workbook as a Node Buffer. */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${(await getCompanyBrand()).name} SpendIQ`;
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31));
    let startRow = 1;

    if (spec.meta && spec.meta.length > 0) {
      for (const [k, v] of spec.meta) {
        const row = ws.getRow(startRow);
        row.getCell(1).value = k;
        row.getCell(1).font = { bold: true };
        row.getCell(2).value = v;
        startRow += 1;
      }
      startRow += 1; // blank spacer
    }

    const headerRow = ws.getRow(startRow);
    spec.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D428A" } };
      cell.alignment = { vertical: "middle" };
      ws.getColumn(i + 1).width = col.width ?? 18;
      if (col.numFmt) ws.getColumn(i + 1).numFmt = col.numFmt;
    });
    headerRow.commit();

    spec.rows.forEach((r, ri) => {
      const row = ws.getRow(startRow + 1 + ri);
      spec.columns.forEach((col, ci) => {
        row.getCell(ci + 1).value = (r[col.key] ?? "") as ExcelJS.CellValue;
      });
      row.commit();
    });

    ws.views = [{ state: "frozen", ySplit: startRow }];
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
