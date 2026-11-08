# Release acceptance criteria

A change ships only when every item is true. CI enforces the ones marked (CI).

1. Type-check and lint pass (run `npm run typecheck` and `npm run lint` before merging; not enforced in CI).
2. No secrets in the diff (CI: `npm run security:scan`).
3. No high or critical vulnerability in production dependencies (CI: `npm audit`, dependency review).
4. CodeQL shows no new high-severity finding (CI).
5. Tests pass: `npm run test:password`, `scripts/test-privacy.ts`, `scripts/test-tenancy-isolation.ts`.
6. New API routes and server actions are covered by the gate (deny by default) with the right class and rate limit.
7. New data reads and writes go through the company-scoped database; no cross-company query.
8. New personal data is added to [data-inventory.md](./data-inventory.md), with retention and purpose.
9. New third-party service is added to `/subprocessors` and the vendor review done.
10. Public claims in copy are true of what is built; no certification, discount or customer is invented.
11. Pages and emails that carry legal text go through counsel before first release.
12. Before a release that changes authentication or payment: a second reviewer signs off.
13. DAST baseline on staging has no new high alert (when `DAST_TARGET_URL` is set).
