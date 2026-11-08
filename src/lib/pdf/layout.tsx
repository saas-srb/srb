import "server-only";
import { View, Text, Image } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { PDF_COLORS, PDF_TYPO } from "@/lib/pdf/brand";
import { usePdfIdentity } from "@/lib/pdf/identity";

/**
 * Shared @react-pdf letterhead used by every generated PDF so they read as one
 * consistent enterprise document set:
 *   - brand lockup on the RIGHT of the header
 *   - company address + contact on the LEFT
 *   - navy rule + coral accent, optional statutory strip, identical footer
 *
 * Server-only. Pairs with `src/lib/pdf/brand.ts`.
 */

const C = PDF_COLORS;

const st = lazyStyles(() => ({
  // ---- brand lockup -------------------------------------------------------
  lockup: { flexDirection: "row", alignItems: "center", gap: 7 },
  lockupCol: { alignItems: "flex-start" },
  wordmark: { fontFamily: "Helvetica-Bold", letterSpacing: -0.3, lineHeight: 1 },
  lockupCaps: { fontFamily: "Helvetica-Bold", color: C.navy, opacity: 0.65, letterSpacing: 1.4, marginTop: 2 },

  // ---- letterhead --------------------------------------------------------
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orgName: { fontFamily: "Helvetica-Bold", color: C.ink, fontSize: 11, lineHeight: 1.2 },
  orgLine: { color: C.mute, marginTop: 1.6, lineHeight: 1.3 },

  rule: { backgroundColor: C.navy, marginTop: 9 },
  accent: { backgroundColor: C.coral, width: PDF_TYPO.accentWidth },

  // statutory registration strip — atomic items that wrap between, never within
  regRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  regItem: { color: C.mute, fontSize: 7, marginRight: 14, marginBottom: 2 },

  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 },
  title: { fontFamily: "Helvetica-Bold", color: C.navy, letterSpacing: 0.4, lineHeight: 1.1 },
  subtitle: { color: C.mute, marginTop: 4, fontSize: 8.5, lineHeight: 1.35 },
  reference: { color: C.mute, textAlign: "right", fontSize: 8.5, lineHeight: 1.45 },

  // ---- footer ----------------------------------------------------------
  footer: {
    position: "absolute",
    bottom: 20,
    left: 24,
    right: 24,
    textAlign: "center",
    color: C.mute,
    fontSize: PDF_TYPO.footer,
  },
}));

/**
 * Icon + two-tone company wordmark + caps line.
 * Faithful to `public/brand/lockup-horizontal-full.svg`, built from the PNG
 * icon + native text (react-pdf's SVG text / web-font support is unreliable).
 */
export function PdfBrandLockup({ compact = false }: { compact?: boolean }) {
  const { logo, wordPrimary, wordAccent, capsLine } = usePdfIdentity();
  const iconSize = compact ? PDF_TYPO.logoIconCompact : PDF_TYPO.logoIcon;
  const wordSize = compact ? PDF_TYPO.wordmarkCompact : PDF_TYPO.wordmark;
  return (
    <View style={st.lockup}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
      {logo ? <Image src={logo} style={{ width: iconSize, height: iconSize }} /> : null}
      <View style={st.lockupCol}>
        <Text style={[st.wordmark, { fontSize: wordSize }]}>
          <Text style={{ color: C.navy }}>{wordPrimary}</Text>
          {wordAccent ? <Text style={{ color: C.coral }}>{wordAccent}</Text> : null}
        </Text>
        {capsLine ? <Text style={[st.lockupCaps, { fontSize: compact ? 5.5 : 6 }]}>{capsLine}</Text> : null}
      </View>
    </View>
  );
}

export interface PdfLetterheadProps {
  /** Big document title, e.g. "PURCHASE ORDER", "PAYSLIP", "Expense Report". */
  title: string;
  /** Right-aligned lines under the header — doc number, date, status. Use `\n` for multiple. */
  reference?: string;
  /** Descriptive line under the title (stays left), e.g. project / vendor / period context. */
  subtitle?: string;
  /** Statutory identifiers — each string is one atomic chip (e.g. "GSTIN: 09…"). Wraps between items. */
  registrations?: string[];
  /** Tighter spacing + single-line address for A4-landscape table reports. */
  landscape?: boolean;
}

export function PdfLetterhead({ title, reference, subtitle, registrations, landscape = false }: PdfLetterheadProps) {
  const ruleH = landscape ? 1.5 : PDF_TYPO.rule;
  const titleSize = landscape ? PDF_TYPO.titleLandscape : PDF_TYPO.title;
  const orgLineSize = landscape ? 7.5 : 8;
  const regs = (registrations ?? []).filter(Boolean);
  const org = usePdfIdentity();

  return (
    <View>
      <View style={st.headRow}>
        <View style={{ maxWidth: landscape ? 360 : 330 }}>
          <Text style={st.orgName}>{org.name}</Text>
          {landscape ? (
            <Text style={[st.orgLine, { fontSize: orgLineSize }]}>
              {[org.addressLine, org.cityLine].filter(Boolean).join(", ")}
            </Text>
          ) : (
            <>
              <Text style={[st.orgLine, { fontSize: orgLineSize }]}>{org.addressLine}</Text>
              <Text style={[st.orgLine, { fontSize: orgLineSize }]}>{org.cityLine}</Text>
            </>
          )}
          <Text style={[st.orgLine, { fontSize: orgLineSize }]}>{org.contactLine}</Text>
        </View>
        <PdfBrandLockup compact={landscape} />
      </View>

      <View style={[st.rule, { height: ruleH }]} />
      <View style={[st.accent, { height: ruleH }]} />

      {regs.length > 0 && (
        <View style={st.regRow}>
          {regs.map((r, i) => (
            <Text key={i} style={st.regItem}>{r}</Text>
          ))}
        </View>
      )}

      <View style={[st.titleRow, { marginTop: regs.length > 0 ? 8 : 12 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[st.title, { fontSize: titleSize }]}>{title}</Text>
          {subtitle ? <Text style={st.subtitle}>{subtitle}</Text> : null}
        </View>
        {reference ? <Text style={st.reference}>{reference}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Fixed page footer — identical on every PDF. `note` replaces the default
 * "computer-generated" disclaimer where a document wants its own wording.
 */
export function PdfFooter({ note }: { note?: string }) {
  const disclaimer = note ?? "Computer-generated document — no signature required.";
  const { legalName } = usePdfIdentity();
  return (
    <Text
      style={st.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${legalName}   ·   ${disclaimer}   ·   Page ${pageNumber} of ${totalPages}`
      }
    />
  );
}

/**
 * Shared style tokens for document bodies. Each renderer drops its private
 * copies of these and pulls the shared version so tables, totals blocks,
 * section titles and signature blocks are pixel-identical everywhere.
 */
export const pdfSheet = lazyStyles(() => ({
  pagePortrait: {
    paddingTop: PDF_TYPO.pagePadding,
    paddingHorizontal: PDF_TYPO.pagePadding,
    paddingBottom: PDF_TYPO.pagePadding + 6,
    fontSize: PDF_TYPO.baseFont,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.35,
  },
  pageLandscape: {
    paddingTop: PDF_TYPO.pagePaddingLandscape,
    paddingHorizontal: PDF_TYPO.pagePaddingLandscape,
    paddingBottom: PDF_TYPO.pagePaddingLandscape + 6,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: C.ink,
  },
  sectionTitle: {
    fontSize: PDF_TYPO.sectionTitle,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 5,
  },
  label: { fontSize: 7.5, color: C.mute, textTransform: "uppercase", letterSpacing: 0.6 },
  value: { fontSize: PDF_TYPO.baseFont, fontFamily: "Helvetica-Bold", marginTop: 1.5 },

  tHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    color: C.white,
    paddingVertical: 4,
    paddingHorizontal: 5,
    fontFamily: "Helvetica-Bold",
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  tRowAlt: { backgroundColor: C.soft },

  totalsBox: { marginTop: 12, alignSelf: "flex-end", width: 230 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.ink,
    borderTopStyle: "solid",
    marginTop: 4,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
  },

  kpiBox: { borderWidth: 1, borderColor: C.line, borderStyle: "solid", borderRadius: 4, padding: 8, backgroundColor: C.soft },
  kpiLabel: { color: C.mute, fontSize: 7.5 },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },

  sigBlock: { alignItems: "flex-start", width: 190 },
  sigLine: { borderTopWidth: 0.75, borderTopColor: C.ink, borderTopStyle: "solid", width: 150, height: 22, marginBottom: 3 },
  sigName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  sigTitle: { fontSize: 7.5, color: C.mute },
}));
