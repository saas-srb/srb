import { facebook } from "./facebook";
import { googleBusiness } from "./google-business";
import { instagram } from "./instagram";
import { linkedin } from "./linkedin";
import { x } from "./x";
import { youtube } from "./youtube";
import type { PlatformKey, PlatformPublisher } from "./types";

export const PUBLISHER_MODULES: Record<PlatformKey, PlatformPublisher> = { instagram, facebook, youtube, linkedin, google_business: googleBusiness, x };
export const publisherFor = (p: PlatformKey): PlatformPublisher => PUBLISHER_MODULES[p];
export * from "./types";
export { ProviderError, redact, classifyHttp } from "./errors";
export { backoffMs, MAX_ATTEMPTS } from "./retry";
export { composeCaption, disclosureFor_, baseValidate, hasErrors } from "./validate";
