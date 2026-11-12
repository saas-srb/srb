#!/usr/bin/env bash
# Deploys a PREBUILT output to Vercel, so the build runs on YOUR machine (or a GitHub runner), not on Vercel's small build container.
#
#   VERCEL_TOKEN=... VERCEL_ORG_ID=... VERCEL_PROJECT_ID=... npm run deploy:prebuilt [-- --dry]
#
# Steps: type-check -> `vercel pull` (project settings and the production environment variables) -> `vercel build --prod` ->
# function-count check on the output (Hobby: at most 10 functions, daily crons) -> `vercel deploy --prebuilt --prod`.
# `--dry` stops after the build and the checks (nothing is uploaded). The three values come ONLY from the environment (never stored in a file) and the
# script refuses to run without them. `.vercel/output` is build output and is git-ignored.
set -euo pipefail
DRY=0
for a in "$@"; do case "$a" in --dry) DRY=1;; *) echo "unknown option: $a" >&2; exit 2;; esac; done
missing=0
for v in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  if [ -z "${!v:-}" ]; then echo "Missing $v (set it in the environment; it is never read from a file)." >&2; missing=1; fi
done
[ "$missing" = 0 ] || exit 2
cd "$(dirname "$0")/.."
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"
export VERCEL_TELEMETRY_DISABLED=1

echo "==> 1/5 type-check"
npm run typecheck
echo "==> 2/5 vercel pull (settings and production environment)"
npx --yes vercel@latest pull --yes --environment=production
echo "==> 3/5 vercel build (--prod)"
npx --yes vercel@latest build --prod
echo "==> 4/5 function count and cron schedules"
npx --yes tsx scripts/check-functions.ts --output .vercel/output
if [ "$DRY" = 1 ]; then echo "==> dry run: stopping before the upload"; exit 0; fi
echo "==> 5/5 vercel deploy --prebuilt --prod"
npx --yes vercel@latest deploy --prebuilt --prod
