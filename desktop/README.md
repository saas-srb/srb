# SelfRun Desktop

The desktop app (Windows, macOS, Linux, built with Electron) for a SelfRun Business workspace. It is the same app a company's team
uses in the browser or installs on a phone, in its own window, with native notifications and a system tray icon.

**Nothing about a company is built in.** The app asks the workspace who it is on every start:

| From the workspace (`/api/desktop/branding`) | Used for |
| --- | --- |
| Name and short name | Window and menu names, About box, tray tooltip, notifications |
| Icon (the company's logo, an uploaded app icon, or its initials) | Window, Dock/taskbar icon, tray icon, notifications |
| Theme colours (light and dark), background colour | The window background and the "can't connect" screen |
| Start page and shortcuts | Where it opens, and the tray and **Go** menu entries |

These are the same settings as the mobile app: **Workspace → Settings → Mobile app**. Change them there and every desktop app picks
the change up the next time it starts, or within 30 minutes while it runs. The last answer is kept, so the app still opens offline.

## Built when a Super Admin presses Generate

On the platform nobody runs `build:company` by hand, and nothing is built automatically. In **Workspace → Settings → Apps → Desktop Application**
each system has its own button (**Generate Windows App**, **Generate macOS App**, **Generate Linux App**). A press starts the **Apps** workflow for that
one system with the company's own name and icon, publishes the installer and puts the download link on the same page. See "Optional: desktop and
mobile apps" (step 15) in `docs/deploy-vercel.md` for the one-time setup. The workflow runs `scripts/build-company.mjs` and then
`scripts/publish-build.mjs` (uploads to the public releases repository and reports back through `scripts/ci-report.mjs`).

## Two ways to get it

1. **One generic app for everyone.** The first start asks "Connect your workspace": type the workspace name (`acme`) or the app
   address (`app.acme.com`). The app finds the workspace, checks it, remembers it and brands itself.
2. **An app built for one company.** Its installer, Start-menu/Applications name and icon on disk are the company's own, and the
   workspace address is built in, so people just open it.

   ```bash
   cd desktop
   npm install
   npm run build:company -- --address acme                 # a workspace on the platform domain
   npm run build:company -- --address acme.com             # a company's own domain (app.acme.com)
   npm run build:company -- --address acme --platform mac,win,linux
   ```

   The script reads the company's name and icon from its workspace, writes `brand.json` (only the address) and runs
   electron-builder. Installers land in `dist-company/<name>/`. Build Windows installers on Windows, macOS ones on a Mac and Linux
   ones on Linux (or let the **Desktop apps** GitHub workflow build all three, see below).

## Notifications

Electron has no Web Push service, so the desktop app asks the workspace what's new about once a minute
(`/api/desktop/notifications`, with the same sign-in as the web app) and shows it with the operating system's notifications.
Clicking one opens that page. It works while the app runs, including minimised to the tray ("Keep running in the tray when
closed", "Start when I sign in" in the tray menu). People manage categories and quiet hours for push on their phone in
Notification settings; the desktop app shows everything that arrives in the bell.

## Run it while developing

```bash
cd desktop
npm install
SELFRUN_ADDRESS=http://acme-app.localhost:3000 npm start      # or just `npm start` and type the address
SELFRUN_DEBUG=1 npm start                                       # lifecycle logging
npm test                                                        # address logic self-test
```

`SELFRUN_ROOT_DOMAIN` changes the platform domain used for workspace names (default `selfrunbusiness.com`).
If your editor sets `ELECTRON_RUN_AS_NODE`, unset it before running Electron.

## Security

- Pages run with `contextIsolation`, `sandbox` and no Node access; the only thing they get is a small `window.desktop` object.
- The window can only show the workspace's own address. Every other link opens in the default browser (`http`, `https`, `mailto`, `tel`).
- Permissions are granted only to the workspace: notifications, clipboard, fullscreen, camera/microphone and screen sharing for calls.
- Only the app's own setup screen can choose a workspace.

## Releases

Installers are built with electron-builder and are not code-signed until you add certificates (an Apple Developer ID and
notarization for macOS, a code-signing certificate for Windows); without them macOS and Windows warn on first open. Auto-update
needs a release server and is not set up. The **Desktop apps** workflow (`.github/workflows/desktop.yml`) builds all three
platforms: run it with an empty address for the generic app, or with a workspace name/domain for a company's app. Building needs Node 22.
