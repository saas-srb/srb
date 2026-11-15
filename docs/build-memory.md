# Production build memory (Vercel Hobby)

Problem: `next build` is OOM-killed on the Vercel standard build machine (8 GB, 2 vCPU). Reproduced locally with `scripts/measure-build.sh` (cgroup cap 7500 MB, 2 CPUs, VERCEL=1).

## Measurements

| Run | Result | Time | Peak |
| --- | --- | --- | --- |
| Baseline full build (Turbopack) | OOM killed | 508 s | 7238 MB |
| Webpack (`--webpack`, `webpackMemoryOptimizations`) | OOM killed | 388 s | 7217 MB |
| Full build + `turbopackSharedRuntime` + `turbopackInferModuleSideEffects:false` | OOM killed | 643 s | 7407 MB |
| Subset: one route | ok | 78 s | 2038 MB |
| Subset: viralpulse / commandos / api / cashflow | ok | 102-165 s | 2435-2959 MB |

Route count: 825 pages + 275 route handlers, 8 serverless functions (`npm run check:functions`, limit 10), daily crons only.

Memory is Rust-side (Turbopack) and grows roughly linearly with route entries on a ~2 GB base. No single heavy module is the cause.

## Flags tried on the commandos subset (baseline 2796 MB)

| Flag | Peak | Verdict |
| --- | --- | --- |
| `turbopackSharedRuntime` | 2584 MB | helps about 8 percent on subsets; did not stop the full OOM |
| `turbopackInferModuleSideEffects:false` | 2726 MB | marginal |
| `turbopackMinify:false` | 2833 MB | no help |
| `turbopackRemoveUnusedImports` | 3222 MB | worse |
| `turbopackFileSystemCacheForBuild` | 3597 MB | worse |
| `turbopackModuleFragments` | panic | rejected |
| webpack | OOM | no better |

Not made permanent: none of them brings the full build under the cap, so they stay as measurement hooks in `next.config.ts` (`BUILD_EXPERIMENTS=shared-runtime,infer-off,...`).

## Result

Still OOM under a 7.5 GB cap. Target (peak under 5.5 GB) NOT reached by config alone. Plainly: the build needs either fewer routes or a bigger machine.

## Reliable options

1. Prebuilt deploy from a bigger machine (free, works today): `npm run deploy:prebuilt` (runs `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod`; needs 12+ GB RAM, set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). `.github/workflows/deploy.yml` does the same on a GitHub runner (larger runner, 16 GB, if the free 7 GB runner OOMs). Disable the Vercel Git auto-build so it does not fail every push: Project > Settings > Git > Ignored Build Step = `exit 0`, or disconnect Git. Pro: no Vercel build limits, build cost under your control. Con: deploy is no longer triggered by Vercel Git; the machine needs RAM.
2. Vercel Pro with Enhanced build machine (more RAM): simplest, paid.
3. Reduce routes (longer term): fold rarely used pages into dynamic routes; every route costs roughly 2-3 MB.

## Guardrails

`npm run check:build-memory` (route/page counts against thresholds), `npm run check:functions` (at most 10 functions), `typescript.ignoreBuildErrors` on Vercel only, NEXT_PHASE build guard kept. Input hygiene: `.vercelignore` (excludes /local, /.next, .env*, build copies) cuts the upload; `tsconfig.json` excludes local build copies.

## Remaining risks

Prebuilt deploy skips Vercel type check (run `tsc` in CI first); function count must stay at or under 12 on Hobby; new pages raise memory further.
