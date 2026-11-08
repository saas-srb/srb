import "server-only";
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { qrToSvg } from "@/lib/products/cohort-ai/qrcode";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { usePdfIdentity } from "@/lib/pdf/identity";
import { PdfBrandLockup } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

/** Server-only. A4 landscape training certificate. Never import from a client component. */

const C = PDF_COLORS;

export interface CertificatePdfData {
  certificateNumber: string;
  verificationCode: string;
  verifyUrl: string;
  typeLabel: string;
  studentName: string;
  programName: string;
  batchName: string | null;
  title: string | null;
  issuedOn: string;
  grade: string | null;
  institute: {
    name: string;
    addressLine: string | null;
    city: string | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
  };
}

function qrDataUri(text: string): string | null {
  try {
    const svg = qrToSvg(text, 120);
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: { padding: 0, fontFamily: "Helvetica", color: C.ink },
  frame: { margin: 18, borderWidth: 2, borderColor: C.navy, borderStyle: "solid", flex: 1, padding: 28, position: "relative" },
  inner: { borderWidth: 0.75, borderColor: C.coral, borderStyle: "solid", flex: 1, padding: 30, alignItems: "center" },
  addr: { fontSize: 8, color: C.mute, marginTop: 4 },
  kicker: { fontSize: 10, letterSpacing: 3, color: C.mute, marginTop: 14, textTransform: "uppercase" },
  h1: { fontSize: 30, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 6, textAlign: "center" },
  presented: { fontSize: 10, color: C.mute, marginTop: 18 },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 8, borderBottomWidth: 1, borderBottomColor: C.gold, borderBottomStyle: "solid", paddingBottom: 4, paddingHorizontal: 24 },
  body: { fontSize: 11, color: C.ink, marginTop: 16, textAlign: "center", maxWidth: 460, lineHeight: 1.5 },
  strong: { fontFamily: "Helvetica-Bold" },
  footRow: { position: "absolute", left: 30, right: 30, bottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sigBlock: { alignItems: "center", width: 160 },
  sigLine: { borderTopWidth: 0.75, borderTopColor: C.ink, borderTopStyle: "solid", width: 140, marginBottom: 3 },
  sigName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  sigTitle: { fontSize: 8, color: C.mute },
  qrBlock: { alignItems: "center", width: 120 },
  qr: { width: 76, height: 76 },
  meta: { fontSize: 7.5, color: C.mute, textAlign: "center", marginTop: 2 },
}));

function CertDocument({ data }: { data: CertificatePdfData }) {
  const org = usePdfIdentity();
  const qr = qrDataUri(data.verifyUrl);
  const outcome = data.title
    ? `for successfully completing ${data.title}`
    : `for the successful completion of the ${data.programName} program`;

  return (
    <Document title={`${data.certificateNumber} — ${data.typeLabel}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <PdfBrandLockup compact />
            <Text style={s.addr}>{org.cityLine}</Text>

            <Text style={s.kicker}>{data.typeLabel}</Text>
            <Text style={s.h1}>Certificate of Achievement</Text>

            <Text style={s.presented}>This is proudly presented to</Text>
            <Text style={s.name}>{data.studentName}</Text>

            <Text style={s.body}>
              <Text>{outcome}</Text>
              {data.batchName ? <Text> ({data.batchName})</Text> : null}
              <Text>, </Text>
              {data.grade ? (
                <Text>
                  with a grade of <Text style={s.strong}>{data.grade}</Text>,{" "}
                </Text>
              ) : null}
              <Text>demonstrating the required skills and professional conduct throughout the training.</Text>
            </Text>

            <View style={s.footRow}>
              <View style={s.sigBlock}>
                <View style={s.sigLine} />
                <Text style={s.sigName}>{data.institute.signatoryName ?? "Authorised Signatory"}</Text>
                <Text style={s.sigTitle}>{data.institute.signatoryTitle ?? "Training Head"}</Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 8, color: C.mute }}>Issued on</Text>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmtDate(data.issuedOn)}</Text>
                <Text style={{ fontSize: 7.5, color: C.mute, marginTop: 4 }}>No. {data.certificateNumber}</Text>
              </View>

              <View style={s.qrBlock}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
                {qr ? <Image src={qr} style={s.qr} /> : null}
                <Text style={s.meta}>Verify at</Text>
                <Text style={s.meta}>{data.verifyUrl.replace(/^https?:\/\//, "")}</Text>
                <Text style={s.meta}>Code: {data.verificationCode}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  return renderPdf(<CertDocument data={data} />) as Promise<Buffer>;
}
