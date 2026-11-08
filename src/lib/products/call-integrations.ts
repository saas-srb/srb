import "server-only";

/**
 * Importing this file registers every product's call hooks (result write-back, do-not-contact checks, caller lookups and target authorizers) with the calling engine.
 * The webhook route, the calls cron job and the call actions should import it once so a call that settles in a process that never
 * rendered a TalentOS or SprintOS page still reaches the right product.
 */
import "@/lib/products/talentos/calls";
import "@/lib/products/sprintos/calls";
import "@/lib/dealflow-ai/call-hooks";
