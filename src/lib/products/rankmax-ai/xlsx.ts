import "server-only";
import ExcelJS from "exceljs";
import { getCompanyBrand } from "@/lib/platform/branding";

/** Minimal formatted-workbook builder (each module keeps its own copy — see `sop/xlsx.ts`). */
export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
}

export async function buildWorkbook(name: string, columns: SheetColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${(await getCompanyBrand()).name} SEO`;
  wb.created = new Date();
  const ws = wb.addWorksheet(name.slice(0, 31));
  const header = ws.getRow(1);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D428A" } };
    ws.getColumn(i + 1).width = col.width ?? 20;
  });
  header.commit();
  rows.forEach((r, ri) => {
    const row = ws.getRow(2 + ri);
    columns.forEach((col, ci) => {
      row.getCell(ci + 1).value = (r[col.key] ?? "") as ExcelJS.CellValue;
    });
    row.commit();
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
