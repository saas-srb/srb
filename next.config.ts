import type { NextConfig } from "next";

// Build-memory EXPERIMENTS (scripts/measure-build.sh): BUILD_EXPERIMENTS=minify-off,infer-off,unused-imports,unused-exports,fragments,webpack-mem,cpus1
// switches one build option each so its effect can be measured in isolation. Unset in normal builds (and ignored when empty).
const EXP = new Set((process.env.BUILD_EXPERIMENTS ?? "").split(",").map((x) => x.trim()).filter(Boolean));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Vercel's build machine ran out of memory (SIGKILL) in the "Running TypeScript" step that Next runs after a successful compile: this app
  // is ~370k lines, so the type-check alone needs more RAM than the free build container has. On Vercel the check is skipped; run
  // `npm run typecheck` (tsc --noEmit) before pushing instead. A local `next build` still type-checks.
  typescript: { ignoreBuildErrors: Boolean(process.env.VERCEL) },
  // The editor test pages under src/app/dev-editor-harness are named page.dev.tsx: they are only routes in `next dev`. In a production build they are
  // not pages, so they cost no serverless function (Vercel Hobby allows only 12 per deployment).
  pageExtensions: process.env.NODE_ENV === "production" ? ["tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js", "dev.tsx"],
  // Dev only: Next's gzip stream gets one 'drain' listener per concurrent response, and the Workspace/panel pages fire many
  // parallel RSC requests, which trips Node's MaxListenersExceededWarning. Production (Vercel) compresses at the edge.
  compress: process.env.NODE_ENV === "production",
  // Node-only libs used inside route handlers — keep them out of the bundler.
  // Big server-only libraries are loaded at run time from node_modules instead of being bundled: far less for the build to parse
  // and bundle (the build of this app is large and slow), with no change in behaviour.
  serverExternalPackages: ["exceljs", "mongodb", "openai", "cheerio", "@react-pdf/renderer", "docx", "jszip", "nodemailer", "web-push", "qrcode", "ffmpeg-static", "sharp"],
  // AI UGC Studio joins scene clips with ffmpeg. `findFfmpeg()` (ugc/assemble.ts) loads the `ffmpeg-static` package by a computed name, which
  // the file tracer cannot see, so the binary would be left out of the deployed function. Ship it explicitly with the routes that render:
  // the UGC cron (advances the queue and assembles), the UGC pages (server actions) and Settings (the System health check looks for it).
  outputFileTracingIncludes: {
    "/api/viralpulse-ai/ugc/cron": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/index.js", "./node_modules/ffmpeg-static/package.json"],
    "/viralpulse-ai/ugc/**": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/index.js", "./node_modules/ffmpeg-static/package.json"],
    "/viralpulse-ai/**": ["./src/lib/products/viralpulse-ai/images/fonts/*"],
    // Playbook documents: the PDF and Word renderers read the bundled Noto Sans files by path, so the tracer must ship them with every route that renders.
    "/api/playbook-ai/**": ["./src/lib/fonts/noto/*"],
    "/playbook-ai/**": ["./src/lib/fonts/noto/*"],
    "/contractflow-ai/**": ["./src/lib/fonts/noto/*"],
    // The signing and verify pages and the other routes that seal or render a document also read the Noto fonts by path. These patterns replace
    // what the build used to pick up by accident when the font path made it trace the whole project.
    "/sign/**": ["./src/lib/fonts/noto/*"],
    "/verify/**": ["./src/lib/fonts/noto/*"],
    "/api/talentos/**": ["./src/lib/fonts/noto/*"],
    "/talentos/**": ["./src/lib/fonts/noto/*"],
    "/api/viralpulse-ai/**": ["./src/lib/fonts/noto/*", "./src/lib/products/viralpulse-ai/images/fonts/*"],
    "/api/contractflow-ai/**": ["./src/lib/fonts/noto/*"],
    "/viralpulse-ai/settings": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/index.js", "./node_modules/ffmpeg-static/package.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // The separate admin panel moved into the Workspace. Old links, bookmarks and
  // URLs stored in notifications keep working. Order matters: first match wins.
  async redirects() {
    return [
      // Voice agents moved from DealFlow AI to AgentOS (Agent Hub). Old links and bookmarks keep working. (/dealflow-ai/voice-calls is now DealFlow's own AI Voice Calls page, a view over AgentOS calls.)
      { source: "/dealflow-ai/agents", destination: "/agentos/hub", permanent: true },
      // The DealFlow knowledge base was removed (agents keep their knowledge in AgentOS).
      { source: "/dealflow-ai/knowledge-base", destination: "/dealflow-ai", permanent: true },
      // Festival Offers, Wallet & Credits, AI Chatbot, Conversation AI moved from the LMS panel to the CMS panel.
      { source: "/lms/:section(offers|wallet|chatbot)", destination: "/cms/:section", permanent: true },
      { source: "/lms/:section(offers|wallet|chatbot)/:path*", destination: "/cms/:section/:path*", permanent: true },

      // Every panel's own audit log moved into the one central Audit log of the Workspace.
      { source: "/lpms/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=lpms", permanent: true },
      { source: "/sop/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=sop", permanent: true },
      { source: "/fms/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=fms", permanent: true },
      { source: "/aibots/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=aibots", permanent: true },
      { source: "/cms/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=cms", permanent: true },
      { source: "/dlms/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=dlms", permanent: true },
      { source: "/seo/audit-logs", destination: "/workspace/settings/audit-log?source=products&module=seo", permanent: true },
      { source: "/hrms/audit", destination: "/workspace/settings/audit-log?source=products&module=hrms", permanent: true },
      { source: "/prms/activity", destination: "/workspace/settings/audit-log?source=products&module=prms", permanent: true },
      { source: "/tms/activity", destination: "/workspace/settings/audit-log?source=products&module=tms", permanent: true },
      { source: "/pms/activity", destination: "/workspace/settings/audit-log?source=products&module=pms", permanent: true },
      { source: "/ots/activity", destination: "/workspace/settings/audit-log?source=products&module=ots", permanent: true },
      { source: "/smms/activity", destination: "/workspace/settings/audit-log?source=products&module=smms", permanent: true },

      { source: "/admin", destination: "/workspace", permanent: true },
      { source: "/admin/login", destination: "/workspace/login", permanent: true },
      { source: "/admin/change-password", destination: "/workspace/change-password", permanent: true },
      // Everything else kept its path: /admin/users → /workspace/users, /admin/analytics/fms → /workspace/analytics/fms, …
      { source: "/admin/:path*", destination: "/workspace/:path*", permanent: true },

      // Everything workspace-specific lives under /workspace. Old links, bookmarks, e-mails and URLs stored in the
      // database keep working; the request's query string is carried over by Next. These patterns are anchored at the
      // start and name exact prefixes, so they never touch /api/*, /platform/*, a business panel's own /<panel>/settings
      // or the public site.
      { source: "/settings/activity", destination: "/workspace/settings/audit-log?source=workspace", permanent: true }, // company activity log → the merged Audit log
      { source: "/settings/:path*", destination: "/workspace/settings/:path*", permanent: true }, // also matches /settings itself
      { source: "/onboarding", destination: "/workspace/onboarding", permanent: true },
      { source: "/upgrade", destination: "/workspace/upgrade", permanent: true },
      // One dashboard (the Command Center became its executive sections), one Audit log, Documents under Account.
      { source: "/workspace/command-center", destination: "/workspace", permanent: true },
      { source: "/workspace/activity-log", destination: "/workspace/settings/audit-log?source=products", permanent: true }, // management activity log → Audit log, panel activity
      { source: "/workspace/documents", destination: "/workspace/account/documents", permanent: true },
    ];
  },
  // Baseline security headers on every response. (No site-wide Content-Security-Policy: companies add their own
  // tracking scripts and chat widgets in CMS → Settings, which a fixed policy would block.)
  async headers() {
    return [
      // The service worker must always be re-checked, and may control the whole origin.
      {
        source: "/web-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Uploaded files / API responses are never pages: nothing in them may run script, and only this site may frame them.
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "script-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" }],
      },
      // Pages: no <base> hijack, no plugins, framed only by this site (same intent as X-Frame-Options, which old browsers use).
      {
        // /agentos-public/agents is the embeddable agent directory: its proxy sets frame-ancestors from the company's allowed websites instead.
        source: "/((?!api/|agentos-public/agents).*)",
        // No plugins or embedded objects, no <base> hijack, framed only by this site, forms post only to https, and (in production) any
        // stray http:// sub-resource is upgraded to https. A script-src is deliberately not set here: companies add their own tracking scripts
        // and chat widgets in CMS → Settings, which a fixed script policy would break (see docs/compliance/gap-assessment.md).
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https:${process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : ""}` }],
      },
      // Only this site may frame itself (the theme customizer previews the site in a same-origin frame). The embeddable agent directory is the exception.
      {
        source: "/((?!agentos-public/agents).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), microphone=(self), interest-cohort=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Other windows (another site that opened this one) get no handle on it; payment / OAuth popups still work.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
  // Verification / well-known text files (Search Console "HTML file", Bing, ads.txt …) come from the company's own
  // CMS → Settings → Tracking, served at the site root where search engines look for them. Any such file name works;
  // the platform's own root files (robots, sitemaps, manifest) are excluded, and the route 404s for names the
  // company hasn't defined.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:file((?!robots\\.txt$|llms\\.txt$|sitemap[^/]*\\.xml$|manifest\\.json$|sw\\.js$|web-sw\\.js$|offline\\.html$)[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:html?|xml|txt|json|js|csv))", destination: "/api/site-verification/:file" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  allowedDevOrigins: ['viminal-susann-calorimetric.ngrok-free.dev', '*.devtunnels.ms'],
  // Development only: a tunnel (VS Code port forwarding, ngrok) sets x-forwarded-host to its own address while the browser's
  // origin stays localhost, which Next rejects as "Invalid Server Actions request". Production keeps the strict same-origin check.
  experimental: {
    // The browser keeps a page it has already loaded, so opening it again (a panel from the Workspace, a sidebar item, the sign-up
    // page) shows at once instead of the loading screen every time. By default pages that read cookies are never kept (0 s). Saving
    // through a server action refreshes the page itself, so edits still show up; this is only how long a plain revisit may reuse the page.
    staleTimes: { dynamic: 180, static: 300 },
    // Build memory. This app is large (hundreds of routes, ~370k lines), and Turbopack's production build was killed for running out of
    // memory on Vercel's build machine ("Creating an optimized production build ... SIGKILL"). Source maps (kept in memory for every
    // module of the server and the browser), scope hoisting (a whole-graph optimisation) and one static-generation worker per CPU are the
    // parts that cost the most memory for the least benefit; the bundle is still minified. Re-enable `turbopackSourceMaps` only on a
    // build machine with memory to spare (or when you need readable server stack traces from production).
    // Barrel packages: only the icons / charts / components actually imported are compiled, not the whole package.
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion", "@base-ui/react"],
    // The build cache is only useful once a build has finished and Vercel has kept it; until then writing it costs memory and time.
    turbopackFileSystemCacheForBuild: false,
    turbopackSourceMaps: false,
    turbopackInputSourceMaps: false,
    turbopackScopeHoisting: false,
    memoryBasedWorkersCount: true,
    ...(EXP.has("minify-off") && { turbopackMinify: false }),
    ...(EXP.has("infer-off") && { turbopackInferModuleSideEffects: false }),
    ...(EXP.has("unused-imports") && { turbopackRemoveUnusedImports: true }),
    ...(EXP.has("unused-exports") && { turbopackRemoveUnusedExports: true }),
    ...(EXP.has("fragments") && { turbopackModuleFragments: true }),
    ...(EXP.has("webpack-mem") && { webpackMemoryOptimizations: true }),
    ...(EXP.has("cpus1") && { cpus: 1, memoryBasedWorkersCount: false }),
    serverActions: {
      // Server actions accept uploads (a GSTR-2B file is up to 5 MB, a bill or receipt up to 15 MB as sent by their own forms); the default is 1 MB.
      bodySizeLimit: '16mb',
      ...(process.env.NODE_ENV !== "production" && { allowedOrigins: ['localhost:3000', '*.localhost:3000', '*.devtunnels.ms', '*.ngrok-free.dev'] }),
    },
  },
};

export default nextConfig;