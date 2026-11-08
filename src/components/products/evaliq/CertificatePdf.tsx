import "server-only";
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { qrToSvg } from "@/lib/products/cohort-ai/qrcode";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { usePdfIdentity } from "@/lib/pdf/identity";
import { PdfBrandLockup } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

/** Server-only. A4 landscape test certificate — same letterhead, QR and frame as the TMS training certificate. */

const C = PDF_COLORS;

export interface OtsCertificatePdfData {
  certificateNumber: string;
  verificationCode: string;
  verifyUrl: string;
  candidateName: string;
  testName: string;
  title: string;
  score: number;
  totalMarks: number;
  percentage: number;
  issuedOn: Date;
  validUntil: Date | null;
  organization: string;
  signatoryName: string;
  signatoryTitle: string;
}

function qrDataUri(text: string): string | null {
  try {
    return `data:image/svg+xml;base64,${Buffer.from(qrToSvg(text, 120)).toString("base64")}`;
  } catch {
    return null;
  }
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

const s = lazyStyles(() => ({
  page: { padding: 0, fontFamily: "Helvetica", color: C.ink },
  frame: { margin: 18, borderWidth: 2, borderColor: C.navy, borderStyle: "solid", flex: 1, padding: 28, position: "relative" },
  inner: { borderWidth: 0.75, borderColor: C.coral, borderStyle: "solid", flex: 1, padding: 30, alignItems: "center" },
  addr: { fontSize: 8, color: C.mute, marginTop: 4 },
  kicker: { fontSize: 10, letterSpacing: 3, color: C.mute, marginTop: 14, textTransform: "uppercase" },
  h1: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 6, textAlign: "center" },
  presented: { fontSize: 10, color: C.mute, marginTop: 16 },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 8, borderBottomWidth: 1, borderBottomColor: C.gold, borderBottomStyle: "solid", paddingBottom: 4, paddingHorizontal: 24 },
  body: { fontSize: 11, color: C.ink, marginTop: 14, textAlign: "center", maxWidth: 480, lineHeight: 1.5 },
  strong: { fontFamily: "Helvetica-Bold" },
  footRow: { position: "absolute", left: 30, right: 30, bottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sigBlock: { alignItems: "center", width: 160 },
  sigLine: { borderTopWidth: 0.75, borderTopColor: C.ink, borderTopStyle: "solid", width: 140, marginBottom: 3 },
  sigName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  sigTitle: { fontSize: 8, color: C.mute },
  qrBlock: { alignItems: "center", width: 130 },
  qr: { width: 76, height: 76 },
  meta: { fontSize: 7.5, color: C.mute, textAlign: "center", marginTop: 2 },
}));

function Cert({ d }: { d: OtsCertificatePdfData }) {
  const org = usePdfIdentity();
  const qr = qrDataUri(d.verifyUrl);
  return (
    <Document title={`${d.certificateNumber} — ${d.title}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <PdfBrandLockup compact />
            <Text style={s.addr}>{org.cityLine}</Text>
            <Text style={s.kicker}>Certificate of Achievement</Text>
            <Text style={s.h1}>{d.title}</Text>
            <Text style={s.presented}>This is to certify that</Text>
            <Text style={s.name}>{d.candidateName}</Text>
            <Text style={s.body}>
              <Text>has successfully passed the </Text>
              <Text style={s.strong}>{d.testName}</Text>
              <Text> assessment conducted by {d.organization}, scoring </Text>
              <Text style={s.strong}>
                {d.score}/{d.totalMarks} ({d.percentage}%)
              </Text>
              <Text>.</Text>
            </Text>
            <View style={s.footRow}>
              <View style={s.sigBlock}>
                <View style={s.sigLine} />
                <Text style={s.sigName}>{d.signatoryName || "Authorised Signatory"}</Text>
                <Text style={s.sigTitle}>{d.signatoryTitle || "Head of Assessments"}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 8, color: C.mute }}>Issued on</Text>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(d.issuedOn)}</Text>
                <Text style={{ fontSize: 8, color: C.mute, marginTop: 4 }}>{d.validUntil ? `Valid until ${fmt(d.validUntil)}` : "No expiry"}</Text>
                <Text style={{ fontSize: 7.5, color: C.mute, marginTop: 4 }}>No. {d.certificateNumber}</Text>
              </View>
              <View style={s.qrBlock}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
                {qr ? <Image src={qr} style={s.qr} /> : null}
                <Text style={s.meta}>Verify at</Text>
                <Text style={s.meta}>{d.verifyUrl.replace(/^https?:\/\//, "")}</Text>
                <Text style={s.meta}>Code: {d.verificationCode}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function renderOtsCertificatePdf(d: OtsCertificatePdfData): Promise<Buffer> {
  return renderPdf(<Cert d={d} />) as Promise<Buffer>;
}
