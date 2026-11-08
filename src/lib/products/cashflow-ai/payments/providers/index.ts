import "server-only";

/**
 * Registers the payment provider with the registry in `../provider.ts`. Imported (for its side effects) by the modules that look the
 * provider up: without it `getPaymentProvider()` finds nothing.
 */
import "./razorpay";
