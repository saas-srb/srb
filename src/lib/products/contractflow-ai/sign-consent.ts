/**
 * The words a signer sees and accepts (B4). Client-safe constants, versioned, kept in one file so a lawyer can review them.
 *
 * REVIEW STATUS: not yet reviewed by a lawyer. The screen shows that marker next to the text. When a lawyer approves new wording, change
 * the text AND bump `CONSENT_VERSION` (every signature records the version and the SHA-256 of the exact text it accepted), and fill in
 * `LEGAL_REVIEW`. Never edit the text of a published version in place.
 *
 * What the built-in signature honestly is: a simple electronic signature. The signer's identity is checked by a one-time code sent to their
 * email address (or phone), their consent, the time, their IP address and device are recorded, and the document is sealed with a hash so a
 * change is detectable. It is NOT an Aadhaar eSign, NOT a digital signature certificate and NOT a licensed e-signing service, and nothing on
 * screen may say or imply that.
 */

export const CONSENT_VERSION = "1";

export const LEGAL_REVIEW: { reviewedBy: string | null; reviewedOn: string | null } = { reviewedBy: null, reviewedOn: null };
export const reviewMarker = (): string =>
  LEGAL_REVIEW.reviewedBy && LEGAL_REVIEW.reviewedOn ? `Wording reviewed by ${LEGAL_REVIEW.reviewedBy} on ${LEGAL_REVIEW.reviewedOn}` : "Wording reviewed by/on: not yet reviewed";

/** Shown at send time, on the signing page and on the certificate of completion. */
export const MANDATORY_NOTICE =
  "This is a simple electronic signature (OTP verified). Some documents are legally ineligible for electronic signing (for example wills, trust deeds, negotiable instruments other than cheques, certain powers of attorney and property conveyance documents) or may need registration, notarisation, stamp duty or a stronger signature. Ask a lawyer before using electronic signature for such documents.";

export const HOW_IT_WORKS =
  "Your identity is checked with a one-time code sent to your email address or phone. Your consent, the time, your IP address and your device details are recorded, and the signed document is sealed with a fingerprint (hash) so that any later change can be detected. This is not an Aadhaar eSign or a digital signature certificate.";

export const CONSENT_TEXT =
  "I have read the document shown on this page. I agree to sign it electronically with the signature I provide below, and I agree that this has the same effect as signing on paper where the law allows it. I understand that this is a simple electronic signature checked by a one-time code, and that my consent, the time, my IP address and my device details are recorded. I confirm that I am the person named on this request, or that I am authorised to sign for them.";

export const TYPED_SIGNATURE_STYLES = [
  { key: "script", label: "Handwriting", css: "'Segoe Script','Brush Script MT','Snell Roundhand',cursive" },
  { key: "serif", label: "Classic", css: "'Georgia','Times New Roman',serif" },
] as const;
export type TypedStyleKey = (typeof TYPED_SIGNATURE_STYLES)[number]["key"];
