import "server-only";
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { VCardDetail } from "@/lib/products/viralpulse-ai/vcard/types";

// Standard Business Card Size: 3.5" x 2" (252pt x 144pt)
const styles = StyleSheet.create({
  page: {
    width: 252,
    height: 144,
    padding: 0,
    margin: 0,
    fontFamily: "Helvetica",
  },
  cardContainer: {
    width: 252,
    height: 144,
    padding: 14,
    flexDirection: "column",
    justifyContent: "space-between",
    position: "relative",
  },
  // Front face styles
  frontHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  frontBadge: {
    fontSize: 6,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    opacity: 0.6,
  },
  frontCenter: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: "auto",
  },
  monogram: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  monogramText: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 7,
    marginTop: 3,
    textAlign: "center",
    opacity: 0.75,
    fontStyle: "italic",
    maxWidth: 200,
  },
  frontFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopStyle: "solid",
    paddingTop: 4,
  },
  websiteText: {
    fontSize: 7,
    opacity: 0.7,
  },
  // Back face styles
  backHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    paddingBottom: 6,
  },
  personInfo: {
    flex: 1,
    paddingRight: 8,
  },
  personName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  jobTitle: {
    fontSize: 8,
    fontFamily: "Helvetica",
    marginBottom: 1,
  },
  companySub: {
    fontSize: 6.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.6,
  },
  qrImage: {
    width: 28,
    height: 28,
    borderRadius: 2,
  },
  contactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 4,
  },
  contactCol: {
    width: "50%",
    paddingVertical: 1.5,
  },
  contactLabel: {
    fontSize: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.5,
  },
  contactValue: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    opacity: 0.85,
  },
  backFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopStyle: "solid",
    paddingTop: 3,
  },
  footerBrand: {
    fontSize: 5.5,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

interface VCardPdfDocumentProps {
  card: VCardDetail;
  qrDataUri?: string | null;
}

export default function VCardPdfDocument({ card, qrDataUri }: VCardPdfDocumentProps) {
  const { style, contact, branding } = card;
  const primary = style.primaryColor || "#1d4ed8";
  const bg = style.backgroundColor || "#ffffff";
  const text = style.textColor || "#0f172a";
  const border = style.accentColor || "#e2e8f0";

  return (
    <Document title={`${card.name} - Visiting Card`} author="ViralPulse AI">
      {/* ── PAGE 1: FRONT FACE (Company Branding) ── */}
      <Page size={[252, 144]} style={[styles.page, { backgroundColor: bg, color: text }]}>
        <View style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.frontHeader}>
            <Text style={[styles.frontBadge, { color: primary }]}>Corporate Identity</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: primary }} />
          </View>

          {/* Center Identity */}
          <View style={styles.frontCenter}>
            <View style={[styles.monogram, { backgroundColor: primary }]}>
              <Text style={styles.monogramText}>
                {card.company ? card.company.charAt(0).toUpperCase() : "C"}
              </Text>
            </View>
            <Text style={[styles.companyName, { color: primary }]}>
              {card.company || "Company Name"}
            </Text>
            {branding.tagline ? (
              <Text style={styles.tagline}>{branding.tagline}</Text>
            ) : null}
          </View>

          {/* Footer */}
          <View style={[styles.frontFooter, { borderTopColor: border }]}>
            <Text style={styles.websiteText}>
              {contact.website ? contact.website.replace(/^https?:\/\//, "") : "Digital Visiting Card"}
            </Text>
            {qrDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={qrDataUri} style={{ width: 16, height: 16 }} />
            ) : (
              <Text style={{ fontSize: 6, opacity: 0.5 }}>Official Card</Text>
            )}
          </View>
        </View>
      </Page>

      {/* ── PAGE 2: BACK FACE (Personal & Contact) ── */}
      <Page size={[252, 144]} style={[styles.page, { backgroundColor: bg, color: text }]}>
        <View style={styles.cardContainer}>
          {/* Header with Name & QR */}
          <View style={[styles.backHeader, { borderBottomColor: border }]}>
            <View style={styles.personInfo}>
              <Text style={[styles.personName, { color: primary }]}>{card.name}</Text>
              <Text style={styles.jobTitle}>{card.jobTitle}</Text>
              <Text style={styles.companySub}>{card.company}</Text>
            </View>
            {qrDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={qrDataUri} style={styles.qrImage} />
            ) : null}
          </View>

          {/* Contact Details Grid */}
          <View style={styles.contactGrid}>
            {contact.email ? (
              <View style={styles.contactCol}>
                <Text style={styles.contactLabel}>Email</Text>
                <Text style={styles.contactValue}>{contact.email}</Text>
              </View>
            ) : null}
            {contact.phone || contact.mobile ? (
              <View style={styles.contactCol}>
                <Text style={styles.contactLabel}>Phone</Text>
                <Text style={styles.contactValue}>{contact.phone || contact.mobile}</Text>
              </View>
            ) : null}
            {contact.website ? (
              <View style={styles.contactCol}>
                <Text style={styles.contactLabel}>Website</Text>
                <Text style={styles.contactValue}>{contact.website.replace(/^https?:\/\//, "")}</Text>
              </View>
            ) : null}
            {contact.city || contact.country ? (
              <View style={styles.contactCol}>
                <Text style={styles.contactLabel}>Location</Text>
                <Text style={styles.contactValue}>
                  {[contact.city, contact.country].filter(Boolean).join(", ")}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Footer */}
          <View style={[styles.backFooter, { borderTopColor: border }]}>
            <Text style={styles.footerBrand}>Powered by ViralPulse AI</Text>
            <Text style={[styles.footerBrand, { color: primary }]}>Scan QR to Connect</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderVCardPdfToBuffer(card: VCardDetail, qrDataUri?: string | null): Promise<Buffer> {
  const doc = <VCardPdfDocument card={card} qrDataUri={qrDataUri} />;
  return renderToBuffer(doc as unknown as Parameters<typeof renderToBuffer>[0]) as Promise<Buffer>;
}
