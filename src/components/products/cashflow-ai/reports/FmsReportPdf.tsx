import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

/**
 * Generic "N labeled rows + a total" report PDF (§30 — Phase 7 fast-follow),
 * following `InvoicePdf.tsx`'s exact skeleton. General enough for every
 * FMS report shaped this way — Revenue, Expense, Tax, Budget vs Actual —
 * so none of them needed their own renderer.
 */

const C = PDF_COLORS;

export interface FmsReportPdfRow {
  label: string;
  value: number;
}

export interface FmsReportPdfSection {
  heading?: string;
  rows: FmsReportPdfRow[];
}

export interface FmsReportPdfData {
  title: string;
  subtitle?: string;
  currency?: string;
  sections: FmsReportPdfSection[];
  total?: { label: string; value: number };
}

function money(n: number, currency = "INR"): string {
  return `${currency} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN")}`;
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  sectionTitle: pdfSheet.sectionTitle,
  tHead: { ...pdfSheet.tHead, marginTop: 12 },
  tRow: pdfSheet.tRow,
}));

function FmsReportDocument({ data }: { data: FmsReportPdfData }) {
  return (
    <Document title={data.title}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title={data.title.toUpperCase()} subtitle={data.subtitle} />

        {data.sections.map((section, si) => (
          <View key={si}>
            {section.heading && <Text style={s.sectionTitle}>{section.heading}</Text>}
            <View style={s.tHead}>
              <Text style={{ flex: 1 }}>Label</Text>
              <Text style={{ width: 110, textAlign: "right" }}>Amount</Text>
            </View>
            {section.rows.length === 0 && <Text style={[s.small, { marginTop: 4 }]}>No data.</Text>}
            {section.rows.map((r, ri) => (
              <View key={ri} style={s.tRow}>
                <Text style={{ flex: 1 }}>{r.label}</Text>
                <Text style={{ width: 110, textAlign: "right" }}>{money(r.value, data.currency)}</Text>
              </View>
            ))}
          </View>
        ))}

        {data.total && (
          <View style={pdfSheet.totalsBox}>
            <View style={pdfSheet.grandRow}>
              <Text>{data.total.label}</Text>
              <Text>{money(data.total.value, data.currency)}</Text>
            </View>
          </View>
        )}

        <PdfFooter note="System-generated report." />
      </Page>
    </Document>
  );
}

export async function renderFmsReportPdf(data: FmsReportPdfData): Promise<Buffer> {
  return renderPdf(<FmsReportDocument data={data} />);
}
