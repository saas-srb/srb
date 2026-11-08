import "server-only";
import { OtpError, checkCode, otpChannels } from "./otp";
import type { CreateRequestInput, IssuedLink } from "./requests";
import { createRequest, getRequest } from "./requests";
import type { RequestDoc, SignerDoc } from "./sign-types";
import type { LpmsViewer } from "./types";

/**
 * The signing layer sits behind this interface so a different provider could replace the built-in one later without touching the model.
 * Exactly one implementation exists: `BuiltInProvider`, a simple electronic signature (a link, an email one-time code, an audit trail and
 * a hash seal). There is no Aadhaar eSign, no digital signature certificate and no licensed signing provider, and nothing here claims one.
 *
 * Steps that need later parts of the build return `{ available: false }` with the reason instead of pretending to work.
 */

export type StepResult<T = Record<string, never>> = ({ available: true } & T) | { available: false; reason: string };

export interface SignatureProvider {
  readonly name: string;
  begin(viewer: LpmsViewer, input: CreateRequestInput): Promise<{ request: RequestDoc; links: IssuedLink[] }>;
  verifyIdentity(signer: SignerDoc, challenge: { code: string }): Promise<StepResult<{ verified: boolean }>>;
  applySignature(signer: SignerDoc, artefact: { kind: "drawn" | "typed" | "uploaded"; data: Uint8Array | string }): Promise<StepResult>;
  seal(request: RequestDoc): Promise<StepResult<{ sha256: string }>>;
  status(requestId: string): Promise<{ request: RequestDoc; signers: Omit<SignerDoc, "tokenHash">[] }>;
}

export class BuiltInProvider implements SignatureProvider {
  readonly name = "built-in";
  begin(viewer: LpmsViewer, input: CreateRequestInput) {
    return createRequest(viewer, input);
  }
  /** Available once an email account can deliver codes. Run inside the signer's company (as the public page does). */
  async verifyIdentity(signer: SignerDoc, challenge: { code: string }): Promise<StepResult<{ verified: boolean }>> {
    const channels = await otpChannels();
    if (!channels.email.available && !channels.sms.available) return { available: false, reason: channels.email.reason ?? "No way to send codes is set up." };
    try {
      await checkCode(signer._id, challenge.code);
      return { available: true, verified: true };
    } catch (err) {
      if (err instanceof OtpError && (err.code === "wrong_code" || err.code === "expired" || err.code === "no_active_code" || err.code === "locked")) return { available: true, verified: false };
      throw err;
    }
  }
  async applySignature(): Promise<StepResult> {
    return { available: false, reason: "Signing is not built yet." };
  }
  async seal(): Promise<StepResult<{ sha256: string }>> {
    return { available: false, reason: "Sealing is not built yet." };
  }
  status(requestId: string) {
    return getRequest(requestId);
  }
}

export const signatureProvider: SignatureProvider = new BuiltInProvider();
