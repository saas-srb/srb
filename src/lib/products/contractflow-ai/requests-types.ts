import type { SignerRole } from "./sign-types";

export interface NewSigner {
  role: SignerRole;
  name: string;
  email: string;
  phone?: string;
  order?: number;
}
