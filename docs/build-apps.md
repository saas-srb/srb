# Building the apps: Linux, Windows, macOS, Android and iOS

A step-by-step guide to building every SelfRun app on your own computer and testing each one.

- **Desktop apps** (Linux, Windows, macOS) are built with Electron, from the `desktop/` folder.
- **Mobile apps** (Android, iOS) are built with Capacitor, from the `mobile/` folder.
- One script, `scripts/build-apps.mjs`, runs them all and checks what each build needs first. You use it through `npm run …`
  commands in the project's root `package.json`.

> The website itself (`npm run build`) is a separate thing. It is what you deploy to Vercel (see `deploy-vercel.md`). This guide is
> only about the installable apps.

---

## Quick start: the commands, in order

Run these from the project folder. Each line says where it must run.

```bash
# 0. Once: Node 22+ and the project
node -v                      # must be v22 or higher
npm install

# 1. See what this computer can build
npm run apps:check

# 2. Build (pick the ones this computer can do)
npm run build:linux          # on Linux    -> desktop/dist/*.AppImage, *.deb
npm run build:windows        # on Windows  -> desktop\dist\*.exe
npm run build:macos          # on a Mac    -> desktop/dist/*.dmg, *.zip
npm run build:android        # JDK 21 + Android SDK -> mobile/dist-mobile/*.apk
npm run build:ios            # on a Mac    -> mobile/dist-mobile/*-ios-xcode-project.zip

# 3. Install and test what you built (section 12 has every platform)
sudo apt install ./desktop/dist/selfrun-desktop_1.0.0_amd64.deb     # Linux .deb
adb install -r mobile/dist-mobile/<Name>-<version>-android.apk      # Android
```

Every app opens straight on its workspace sign-in (default `https://app.selfrunbusiness.com`). For one company's own app add
`--origin <its app address>`, for example `--origin http://app.localhost:3000` while developing. Details are below.

---

## 1. What each platform needs

An app can only be built on the right kind of computer. This is a limit of the operating systems, not of this project.

| Platform | Build it on | Needs | You get |
| --- | --- | --- | --- |
| **Linux** | Linux | Node 22+ | `.AppImage` and `.deb` |
| **Windows** | Windows | Node 22+ | `.exe` installer (NSIS) |
| **macOS** | A Mac | Node 22+ | `.dmg` and `.zip` |
| **Android** | Linux, Windows or macOS | Node 22+, **JDK 21+**, Android SDK | `.apk` and an Android Studio project `.zip` |
| **iOS** | A Mac | Node 22+, Xcode, CocoaPods | An Xcode project `.zip` |

**Every build opens straight on its workspace.** There is no "Connect your workspace" screen. Each company has its own app address, and
the app is built for it:

| Where the app opens | How you build it |
| --- | --- |
| The platform's own app, `https://app.selfrunbusiness.com` | No option. This is the default. Change it with `SELFRUN_APP_ORIGIN` |
| A company's app, such as `https://acme-app.selfrunbusiness.com` or `https://app.acme.com` | Add `--origin <address>` (or `--address acme`). The app takes that company's name and icon |
| Your local dev app, `http://app.localhost:3000` | Add `--origin http://app.localhost:3000` (the dev server must be running) |

Add `--generic` (desktop only) for the one app that asks "Connect your workspace" on first start.

Android and iOS work the same way: with no `--origin` they use the platform's own app address.

---

## 2. One-time setup

### 2.1 Install Node 22 or newer

```bash
node -v        # must print v22 or higher
```

Install it from <https://nodejs.org> or with a version manager (`nvm install 22`).

### 2.2 Install the project

From the project folder (the one that holds the root `package.json`):

```bash
npm install
```

### 2.3 Check what this computer can build

```bash
npm run apps:check
```

It prints a line for each platform:

```
✓ Linux     ready
✗ Windows   build this on Windows (…)
✗ macOS     build this on a Mac (…)
✓ Android   ready
✗ iOS       needs a Mac with Xcode (…)
```

Fix anything marked ✗ that you want to build, using the sections below, then run the check again.

### 2.4 (Optional) Install the app dependencies in advance

```bash
npm run apps:install
```

This installs the packages in `desktop/` and `mobile/`. You can skip it: every build does it for you the first time.

---

## 3. Linux

**Build on a Linux computer.**

```bash
npm run build:linux
```

What happens: the script installs Electron and electron-builder (a large download the first time), then builds the app.

Result in `desktop/dist/`:

- `SelfRun Business-1.0.0.AppImage`
- `selfrun-desktop_1.0.0_amd64.deb`

**Test it**

```bash
chmod +x "desktop/dist/SelfRun Business-1.0.0.AppImage"
"desktop/dist/SelfRun Business-1.0.0.AppImage"          # runs without installing
# or install the .deb:
sudo apt install ./desktop/dist/selfrun-desktop_1.0.0_amd64.deb
```

The app opens straight on the workspace sign-in. (Built with `--generic`, it opens on "Connect your workspace" instead.)

If the AppImage does not start on a very new Ubuntu, run it with `--no-sandbox` or install FUSE (`sudo apt install libfuse2`).

---

## 4. Windows

**Build on a Windows computer.** (On Linux or macOS it needs Wine, so the script refuses and asks you to use Windows or the GitHub
workflow in section 9.)

In PowerShell, from the project folder:

```powershell
npm run build:windows
```

Result in `desktop\dist\`: `SelfRun Business Setup 1.0.0.exe`.

**Test it**

1. Double-click the installer and install.
2. Windows may show "Windows protected your PC", because the installer is not code-signed. Click **More info → Run anyway**.
3. Open **SelfRun Business** from the Start menu and sign in.

---

## 5. macOS

**Build on a Mac.** (macOS apps cannot be built anywhere else.)

```bash
npm run build:macos
```

Result in `desktop/dist/`: a `.dmg` and a `.zip`.

**Test it**

1. Open the `.dmg` and drag the app to Applications.
2. macOS may say the app "cannot be opened because the developer cannot be verified" (it is not signed or notarized). Right-click
   the app, choose **Open**, then **Open** again. Or run `xattr -cr "/Applications/SelfRun Business.app"`.
3. Sign in.

---

## 6. Android

Android is one app for one workspace. With no `--origin` it opens `https://app.selfrunbusiness.com`; add `--origin` for a company's app,
for example `https://acme-app.selfrunbusiness.com`. The workspace must be online: the script reads its name, icon and colours from it.

### 6.1 Install what Android needs (once)

1. **JDK 21 or newer** (the Android project is built with Java 21; JDK 17 fails with `invalid source release: 21`). Check with `java -version`.
   Ubuntu/Debian: `sudo apt install openjdk-21-jdk`. macOS: `brew install openjdk@21`. Windows: install Temurin 21 from <https://adoptium.net>.
   You do not have to switch your default Java: if a JDK 21 is installed next to it the build finds it and uses it by itself.
2. **Android Studio** (it installs the Android SDK): <https://developer.android.com/studio>. Open it once and accept the licences
   (SDK Manager → install the latest "Android SDK Platform" and "Build-Tools").
3. Tell the build where the SDK is. The script finds `~/Android/Sdk` by itself; otherwise set `ANDROID_HOME`:

   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk        # macOS / Linux
   setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"   # Windows (then open a new terminal)
   ```

4. Run `npm run apps:check` and confirm Android shows ✓.

### 6.2 Build

```bash
npm run build:android -- --origin https://acme-app.selfrunbusiness.com
npm run build:android -- --origin https://acme-app.selfrunbusiness.com --version 1.0.3
```

No Android SDK yet? Make only the project ZIP:

```bash
npm run build:android -- --origin https://acme-app.selfrunbusiness.com --no-build
```

Result in `mobile/dist-mobile/`:

- `<Name>-<version>-android.apk`: debug-signed. It installs on a phone that allows "unknown apps".
- `<Name>-<version>-android-studio-project.zip`: open in Android Studio, sign with your own key and publish to Google Play.

### 6.3 Test it

```bash
adb install -r mobile/dist-mobile/<Name>-<version>-android.apk
```

Or copy the `.apk` to the phone and open it (allow "Install unknown apps" for your file manager). The app opens the company's live
workspace.

---

## 7. iOS

**Build on a Mac with Xcode.** Like Android, it opens the platform's app by default; add `--origin` for a company's app.

```bash
npm run build:ios -- --origin https://acme-app.selfrunbusiness.com --version 1.0.3
```

Result in `mobile/dist-mobile/`: `<Name>-<version>-ios-xcode-project.zip`.

iPhone apps cannot be installed without Apple signing, so **the Xcode project is the deliverable**:

1. Unzip it and open the project in Xcode.
2. Select the app target → **Signing & Capabilities** → choose your Apple Developer **Team**.
3. Pick a simulator or a connected iPhone and press **Run** to test.
4. For the App Store: **Product → Archive → Distribute App**.

Apple may question apps that only wrap a website. Add some native value before submitting.

---

## 8. Build everything this computer can

```bash
npm run build:apps -- --origin https://acme-app.selfrunbusiness.com
```

It builds the desktop app for this computer's operating system, then Android (if the JDK and SDK are found) and iOS (on a Mac).
Anything it cannot build, it skips and tells you why. Without `--origin` all of them open on the platform's own app.

---

## 9. A company's own app, or all three desktop systems at once

**One company's desktop app** (its name, icon and address built in). Add `--address` or `--origin` to a desktop command:

```bash
npm run build:linux   -- --address acme              # a workspace on the platform domain
npm run build:windows -- --address acme.com          # a company's own domain (app.acme.com)
npm run build:macos   -- --origin https://acme-app.selfrunbusiness.com --version 1.0.3
```

Result in `desktop/dist-company/<name>/`.

**Windows, macOS and iOS without owning those computers: the GitHub workflow.** GitHub builds on its own Windows and Mac machines.
The workflow file is `.github/workflows/desktop.yml`. It builds the code that is on GitHub, so push your changes first.

1. Commit and push the project to GitHub (`git push`). The workflow always uses the pushed code, not what is only on your computer.
2. On GitHub open the repository → **Actions** → **Apps (desktop and mobile)** → **Run workflow**.
3. Fill the form:
   - **platforms**: `win,mac,ios` for exactly those three (the full list is `win,mac,linux,android,ios`; empty builds all five).
   - **origin**: leave empty for the platform's own app (`https://app.selfrunbusiness.com`), or type a company's app address.
   - **version**: optional, such as `1.0.1`.
   - **generic**: leave unticked. Tick it only for the desktop app that asks "Connect your workspace".
4. Press **Run workflow** and wait (Windows and macOS take roughly 5 to 15 minutes, iOS a few minutes).
5. Open the finished run. At the bottom, under **Artifacts**, download `app-win`, `app-mac` and `app-ios` (each is a ZIP with the files).

| Artifact | Inside | How to test it |
| --- | --- | --- |
| `app-win` | `…Setup….exe` | Windows: section 12, Windows |
| `app-mac` | `.dmg`, `.zip` | macOS: section 12, macOS |
| `app-ios` | `…-ios-xcode-project.zip` | Open it in Xcode on a Mac: section 12, iOS |

The platform's builds for companies (started by the **Generate … App** buttons, step 15 of `deploy-vercel.md`) use this same workflow with the secrets and the releases
repository set; a manual run needs neither. To open the apps on a different default address, set the repository variable
`SELFRUN_APP_ORIGIN` (Settings → Secrets and variables → Actions → Variables).

---

## 10. Quick reference

| I want to… | Command |
| --- | --- |
| See what this computer can build | `npm run apps:check` |
| Install the apps' dependencies | `npm run apps:install` |
| Linux app | `npm run build:linux` |
| Windows app | `npm run build:windows` |
| macOS app | `npm run build:macos` |
| Android app | `npm run build:android` (add `--origin <app address>` for a company) |
| iOS project | `npm run build:ios` (add `--origin <app address>` for a company) |
| Everything possible here | `npm run build:apps` |
| An app that asks "Connect your workspace" | add `--generic` to a desktop command |
| A company's desktop app | add `--address <name or domain>` to a desktop command |
| Set the version | add `--version 1.2.0` |
| Only the unpacked desktop app (a quick check) | add `--dir` |
| Android project ZIP only (no SDK needed) | add `--no-build` |

You can also set `SELFRUN_ORIGIN` (a company) or `SELFRUN_APP_ORIGIN` (the platform's own app) once instead of typing `--origin`.

Where the files go:

| Build | Folder |
| --- | --- |
| Generic desktop app | `desktop/dist/` |
| A company's desktop app | `desktop/dist-company/<name>/` |
| Android, iOS | `mobile/dist-mobile/` |

These folders are ignored by git, so built files are never committed.

---

## 11. Troubleshooting

| You see | Cause and fix |
| --- | --- |
| `Node … is too old` | Install Node 22 or newer (`nvm install 22 && nvm use 22`). |
| `Windows installers are built on Windows` / `macOS apps can only be built on a Mac` | Run the command on that operating system, or use the GitHub workflow (section 9). |
| `Couldn't read the workspace` | The address is wrong or the workspace is offline. Open `<address>/api/desktop/branding` in a browser: it must return JSON. |
| `The workspace has no icon yet` | In that workspace set an icon: **Workspace → Settings → Mobile app** (or Branding), then build again. |
| The workflow run does not show up, or builds old code | Push first (`git push`); the workflow runs on the branch you pick in **Run workflow**, using what is on GitHub. |
| `Android builds need JDK 21 or newer` | Install JDK 21+ (`sudo apt install openjdk-21-jdk`), or add `--no-build`. |
| Gradle: `error: invalid source release: 21` | The JDK used is older than 21. Install JDK 21 and run the build again (the build picks it up by itself). |
| `The Android SDK was not found` | Install Android Studio and set `ANDROID_HOME`, or add `--no-build`. |
| Gradle: `SDK location not found` or licence errors | Open Android Studio → SDK Manager and accept the licences, or run `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses`. |
| The first build is slow | Electron, electron-builder and Gradle download a lot the first time. Later builds are fast. |
| macOS or Windows warns the app is from an unknown developer | The installers are not code-signed. Add an Apple Developer ID and notarization (macOS) and a code-signing certificate (Windows) to remove the warning. |
| Android or iOS app: the header or top buttons are hidden under the status bar and cannot be tapped | Two things must both be current: (1) deploy the website, because it stops drawing pages under the system bars when the app's user agent says `WorkspaceNative`; (2) rebuild and reinstall the app (`npm run build:android`), because the user agent and the system-bar setting are written into the app when it is built. An app built before this change keeps the old behaviour. |
| `Couldn't read the workspace` on a default build | The default build only writes the address into the app and does not contact it, so this only happens with `--origin` or `--address`. |

More about each app: `desktop/README.md` and `mobile/README.md`.

---

## 12. Installing the built apps

Where each file is, how to install it, and how to remove it.

### Linux

| File | Install | Run | Remove |
| --- | --- | --- | --- |
| `desktop/dist/selfrun-desktop_1.0.0_amd64.deb` | `sudo apt install ./desktop/dist/selfrun-desktop_1.0.0_amd64.deb` | Menu: **SelfRun Business**, or `selfrun-desktop` | `sudo apt remove selfrun-desktop` |
| `desktop/dist/SelfRun Business-1.0.0.AppImage` | `chmod +x "desktop/dist/SelfRun Business-1.0.0.AppImage"` (no install needed) | `"desktop/dist/SelfRun Business-1.0.0.AppImage"` | Delete the file |

Upgrading to a new build: run the same `apt install` again over the old one, then close and reopen the app. If the menu icon looks old,
log out and in, or run `sudo gtk-update-icon-cache /usr/share/icons/hicolor`. If the window does not open, start it with `--no-sandbox`
(and for the AppImage on a new Ubuntu: `sudo apt install libfuse2`).

The app is installed in `/opt/SelfRun Business/` (about 300 MB).

### Windows

1. Copy `desktop\dist\SelfRun Business Setup <version>.exe` to the computer.
2. Double-click it. If Windows says "Windows protected your PC", click **More info → Run anyway** (the installer is not code-signed).
3. Choose the install folder and finish. Open **SelfRun Business** from the Start menu.
4. Remove it in **Settings → Apps → Installed apps → SelfRun Business → Uninstall**.

### macOS

1. Open `desktop/dist/<name>-<version>.dmg` and drag the app to **Applications**.
2. First start: right-click the app → **Open** → **Open** (it is not signed or notarized), or run
   `xattr -cr "/Applications/SelfRun Business.app"`.
3. Remove it by dragging it from Applications to the Bin.

### Android

1. Make the file reach the phone, or install over USB: `adb install -r mobile/dist-mobile/<Name>-<version>-android.apk`.
2. On the phone allow **Install unknown apps** for the app you opened the file with (Files, Chrome, WhatsApp …).
3. Open the `.apk` and tap **Install**.
4. Remove it like any app: long-press the icon → **Uninstall**.

For Google Play, do not use this `.apk`: open `…-android-studio-project.zip` in Android Studio, sign it with your own key and upload it.

### iOS

iPhone apps cannot be installed from a file. Unzip `…-ios-xcode-project.zip`, open it in Xcode on a Mac, choose your Apple team under
**Signing & Capabilities**, connect an iPhone (or pick a simulator) and press **Run**. For the App Store use **Product → Archive**.

### What happens after you install

Each app opens on its workspace sign-in. Colours, name and shortcuts come from the workspace and update by themselves, so you do not
rebuild an app when a company changes its branding. You only rebuild to change the installer's own file name or icon, to move the app to a
different address, or to release a new version of the app itself.

---

## 13. How a company gets its own apps (the Generate buttons)

Everything above builds apps on your own computer. A company on the platform gets its apps from **Workspace → Settings → Apps**, with no one running commands:

- The **PWA** needs no build. It installs from the browser, and its name, icon and colours are the company's own.
- **Mobile** and **Desktop** tabs have one button per app: **Generate Android App**, **Generate iOS App**, **Generate Windows App**,
  **Generate macOS App**, **Generate Linux App**. A Super Admin presses the ones needed; once an app exists the button reads **Regenerate …**.
- **Nothing is built automatically.** Not when onboarding finishes, not after the company renames itself or changes its icon (the page then
  suggests **Regenerate**), not by a daily job. Only a button press starts a build, and only for that one app.
- A press starts the GitHub workflow in `.github/workflows/desktop.yml` for that platform with the company's address. It builds, publishes the
  file to the releases repository and the download link appears on the same page, which updates itself while it waits (about 10 to 20 minutes).
- Different apps can build at the same time; the same app cannot be started twice.
- If the platform's build service is not connected (`GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN`, `DESKTOP_BUILD_SECRET`; see `deploy-vercel.md`
  step 15), the buttons say so and the asset packs can still be downloaded.

**Nothing of the platform's brand is in a company's app.** The name, short name, icon, splash, colours, start page and shortcuts come from
the company. The installer file names, the app id (`app.<company>.desktop`, `app.<company>.mobile`), the Windows publisher, the Linux maintainer
and vendor, the copyright line, the window titles, notifications and the tray all use the company's own name. The only places the platform's
name appears are the platform's own app (`https://app.selfrunbusiness.com`) and the installers you build with no `--origin` for the platform itself.

### Settings the Generate buttons need (Vercel and GitHub)

Where each value comes from, in order. You make three secrets once and put them in two places.

**A. Make the values**

| Name | Where the value comes from |
| --- | --- |
| `DESKTOP_BUILD_SECRET` | Make it yourself: run `openssl rand -base64 32` (or any 32+ character random text). Use the **same** value in Vercel and in GitHub |
| `GITHUB_REPOSITORY` | Your code repository as `owner/name`, for example `yashorbittech/selfrun` (the part of the GitHub address after `github.com/`) |
| `DESKTOP_RELEASES_REPO` | A second, **public** repository for the finished installers, for example `yashorbittech/selfrun-app-releases` (GitHub → New repository → Public → tick "Add a README") |
| `RELEASES_TOKEN` | GitHub → your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Repository access: only the releases repository. Permission: **Contents: Read and write**. Copy the token once, it is shown only once |
| `GITHUB_DISPATCH_TOKEN` | Same page, a second token. Repository access: only the code repository. Permission: **Actions: Read and write** |

**B. Put them in Vercel** (Project → **Settings → Environment Variables**, environment **Production**, then **Redeploy**)

| Key | Value |
| --- | --- |
| `GITHUB_REPOSITORY` | `owner/code-repo` |
| `GITHUB_DISPATCH_TOKEN` | the Actions token |
| `DESKTOP_BUILD_SECRET` | the random secret |
| `DESKTOP_RELEASES_REPO` | `owner/releases-repo` (optional, but then only downloads from that repository are accepted) |
| `GITHUB_WORKFLOW_FILE` | optional, default `desktop.yml` |
| `GITHUB_WORKFLOW_REF` | optional, default `main` (the branch the workflow runs from) |

**C. Put them in GitHub** (code repository → **Settings → Secrets and variables → Actions**)

| Tab | Name | Value |
| --- | --- | --- |
| Secrets | `DESKTOP_BUILD_SECRET` | the same random secret |
| Secrets | `RELEASES_TOKEN` | the Contents token |
| Variables | `DESKTOP_RELEASES_REPO` | `owner/releases-repo` |
| Variables | `SELFRUN_APP_ORIGIN` | optional: only if the platform's own app is not `https://app.selfrunbusiness.com` |

Then press a Generate button on a test company's Settings → Apps page. If it says the build service is not connected, one of the three Vercel keys
`GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN` or `DESKTOP_BUILD_SECRET` is missing or the site was not redeployed after adding them.

**If a Generate button does not start a build.** The page now shows the reason straight away (it no longer waits on "Generating…"):

| Message | What to check |
| --- | --- |
| "The platform's build service isn't connected yet…" | `GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN` or `DESKTOP_BUILD_SECRET` is missing in Vercel Production, or the site was not redeployed after adding them |
| "Could not start the build: GitHub answered 404" | `GITHUB_REPOSITORY` is wrong, the token has no access to that repository, or the workflow file is not on the branch in `GITHUB_WORKFLOW_REF` (push it) |
| "GitHub answered 401 / 403" | The `GITHUB_DISPATCH_TOKEN` is wrong, expired, or lacks **Actions: Read and write** on the code repository |
| 403 `Resource not accessible by personal access token` | The token cannot start workflows. Fine-grained token: Resource owner = the repository's owner, Repository access = that repository, permissions **Actions: Read and write**, **Contents: Read-only**, **Metadata: Read-only**. Classic token: scopes `repo` and `workflow`. Also check `GITHUB_REPOSITORY` is exactly `owner/repo`, `.github/workflows/desktop.yml` is pushed to the repository's default branch, and (organisation repositories) the organisation allows personal access tokens. Put the new token in `.env.local` / Vercel and restart or redeploy |
| "Could not reach GitHub (…)" | The server could not open api.github.com at all: no internet, DNS, a proxy or a firewall on the machine that runs the site. Not a token problem |
| "The build runs on GitHub's computers, which cannot reach app.localhost:3000" | You pressed Generate on a local site. The build and its report-back need a public address, so use the deployed site (or set `ALLOW_LOCAL_APP_BUILDS=1` only if your local site is reachable from the internet) |
| "GitHub answered 422" | The workflow's inputs do not match; push the latest `.github/workflows/desktop.yml` |

A run that starts from the GitHub Actions page by hand always works without these keys because it needs no callback. A run started by a
Generate button also needs `DESKTOP_BUILD_SECRET` to match in both places, so the finished file is reported back to the Apps page.

---

## 14. Voice calls (AgentOS): what an install needs

Phone calls, live listen and take-over, and website voice agents are part of the web app, not the desktop or mobile builds; the built apps open the same pages.

- **New dependency:** `@twilio/voice-sdk` (the browser softphone used to listen in and take over). It is installed by `npm install`; nothing else to add.
- **Cron job:** `agentos-calls` (once daily, `/api/agentos/cron`, each company) dials due scheduled calls, settles finished ones and records inbound calls whose webhook was missed. It is in the cron registry like every other job (on Vercel, `npm run cron:sync` registers it); it needs no extra settings.
- **Server settings:** only the platform encryption key already required for stored connections. Twilio, ElevenLabs and the call-results webhook are configured per company inside the app (CommandOS → AgentOS settings → Phone), never in `.env`.
- **Twilio webhooks** (you paste only the voice URL into the TwiML App; the engine passes the status and transcription addresses to Twilio itself when it places a call): `/api/agentos/twilio/voice`, `/api/agentos/twilio/status` and `/api/agentos/twilio/transcription`. Each verifies Twilio's signature; the public site address must be reachable by Twilio.
- **Client address (rate limits, bans, website-call limits):** the app trusts forwarding headers only as told. On Vercel it uses Vercel's own header. Elsewhere it reads `X-Forwarded-For` from the right: `TRUSTED_PROXY_HOPS` (default `1`) is how many of your proxies sit in front of the app (`0` = none, headers ignored). `cf-connecting-ip` is believed only when `TRUST_CLOUDFLARE=1`. `X-Real-IP` is never trusted.
- **Webhook token:** Twilio and ElevenLabs can only send their own signature header, so the company token stays in the `?t=` query of the webhook URL (it is redacted in the app's logs; the HMAC / Twilio signature is the real authentication).
- **Test number:** CommandOS → AgentOS settings → Phone → Call settings → Test number. While set, every outbound call rings that number instead of the real one (calls are marked TEST).
- **Website embed:** `<script src="https://<company site>/agentos-public/embed.js" async></script>`.
- **Tests:** `npm run test:voice` (engine, UI data, website calls, TalentOS and DealFlow hooks, conference calls and the Call History follow-up). They use a throwaway MongoDB database and an injected fetch: no real call is placed and no provider is contacted. Never point them at the real database.

## 14b. ViralPulse AI (social media and AI UGC videos): what an install needs

- **New dependencies:** `ffmpeg-static` (an ffmpeg binary, used by AI UGC Studio to join scene clips into one video and burn in captions, the AI label and the notice) and `sharp` (image processing, for upcoming image conversion and resizing). Both are installed by `npm install`. Licences: `sharp` is Apache-2.0 (it downloads prebuilt libvips, LGPL); `ffmpeg-static` is GPL-3.0-or-later (it ships a GPL ffmpeg build that the app runs as a separate process). If your distribution terms cannot carry a GPL binary, do not install it: set `FFMPEG_PATH` to an ffmpeg you are licensed to use instead.
- **Where ffmpeg is found, in order:** `FFMPEG_PATH` (full path to a binary), the `ffmpeg-static` package, then `ffmpeg` on the system PATH. Without any, multi-scene videos stay as separate clips. The binary must include the `subtitles` filter (libass) for captions; the bundled one does (it has no `drawtext`, which the app does not use). ViralPulse > Settings > System health shows which one is used and whether captions work.
- **Vercel / `next build` output:** the app loads ffmpeg by a computed name, which Next's file tracer cannot see, so `next.config.ts` lists it in `outputFileTracingIncludes` for `/api/viralpulse-ai/ugc/cron`, `/viralpulse-ai/ugc/**` and `/viralpulse-ai/settings`, and `ffmpeg-static` and `sharp` are in `serverExternalPackages`. The binary adds about 70 MB to those functions (Vercel's limit is 250 MB unzipped per function). If you change those routes' paths, change the keys too.
- **Optional server setting:** `FFMPEG_PATH`. `LINKEDIN_API_VERSION` (YYYYMM) is only a fallback now: the LinkedIn version is set in ViralPulse > Settings (default `202610`, the latest on Microsoft Learn on 2026-11-01; LinkedIn supports each version for at least a year). System health warns 60 days before a version's sunset.
- **OAuth redirect URLs:** register `<your app address>/api/viralpulse-ai/oauth/{meta|google|linkedin|x}/callback` (with `/callback`) in each provider's developer app; ViralPulse > Settings > Connected accounts shows the exact address. The app ID/secret of each developer app (Meta, Google, LinkedIn, X) are saved in Workspace > Settings > Integrations; SelfRun has no shared social app.
- **Connected accounts (`/viralpulse-ai/settings/accounts`):** several Pages, Instagram accounts, YouTube channels, LinkedIn profiles/organisations, X accounts and Meta ad accounts per company, each switched on or off, with an optional client label. Tokens are AES-256-GCM encrypted (`PLATFORM_ENCRYPTION_KEY`), each value carries a key id. **Key rotation:** set the new key as `PLATFORM_ENCRYPTION_KEY` and keep the old one in `PLATFORM_ENCRYPTION_KEY_PREVIOUS` (or `SMMS_ENCRYPTION_KEY_PREVIOUS`, base64 32 bytes); the 30-minute sweep re-seals everything, then drop the old key. The scheduled job `viralpulse-accounts` (every 30 minutes, `/api/viralpulse-ai/accounts/cron`, in `vercel.json`) renews tokens, asks each platform whether the login is still valid, and warns admins 14/7/3/1 days before a login that cannot renew itself (Meta, LinkedIn) expires. Existing single connections are migrated lazily on first use; nothing is deleted until a login is disconnected.
- **What each platform needs from you:** Meta: a Business-type app with Facebook Login; people with a role on the app work in Standard access, anyone else needs App Review and Business Verification for `pages_manage_posts`, `instagram_content_publish`, insights and ads permissions. Google: YouTube Data API v3 (and YouTube Analytics API) enabled, OAuth consent screen verification, and the YouTube API Services audit (until then uploads are private); Business Profile API access must be requested. LinkedIn: the "Share on LinkedIn" product for profiles; the Community Management API (LinkedIn approval, verified page) for organisation pages. X: a developer app with OAuth 2.0 (confidential client, Read and write) and prepaid credits.
- **Tests:** `test-viralpulse-wp2.ts` (part of `npm run test:viralpulse`) runs the whole OAuth, refresh, rotation, revoke and sweep logic against fake provider servers.
- **AI models:** defaults are `gpt-6-luna` (text) and `gpt-image-2.5-flare` (images); `gpt-image-1` was shut down by OpenAI on 2026-10-23. The configured models are checked against the company's own OpenAI key (`GET /v1/models`); a retired one falls back to a current model with a visible note. The key needs permission to list models. Video uses `gemini-omni-1.1-flash`; every Veo model was retired by Google.
- **AI Image Studio:** needs `sharp` (already required). Text on pictures uses the Noto fonts bundled in `src/lib/products/viralpulse-ai/images/fonts`; `next.config.ts` lists them in `outputFileTracingIncludes` for `/viralpulse-ai/**`. Set `IMAGE_FONT_DIR` only if you move them. Gemini images use the same `gemini` connection as UGC video (optional). Per-company limits are in ViralPulse > AI Image Studio > Brand kit.
- **Tests:** `npm run test:viralpulse` (model fallback, image price maths, LinkedIn version window, redirect URL, health, demo-seeder guard) uses a throwaway MongoDB database and an injected fetch: no provider is contacted.
- **Publishing engine (WP3a):** no new dependencies (uses `sharp` for the JPEG copies Instagram needs). The scheduler is the 5-minute job `viralpulse-publisher` (`/api/viralpulse-ai/publisher/cron`, in `vercel.json`, replaces the daily `/api/viralpulse-ai/cron`); publishes are tracked in the `smms_publish_attempts` collection (created with its indexes on first use). Media for Instagram, Facebook and Business Profile is fetched by the platform from a signed URL on the company's own site, so the site must be publicly reachable. Per-platform specs, dates and what is unverified: `src/lib/products/viralpulse-ai/publishers/SPEC.md`. `npm run test:viralpulse` now also runs `scripts/test-viralpulse-wp3.ts` (fake fetch, throwaway database).
- **Paid ads (Campaigns & Ads, Meta):** Facebook and Instagram ads are created, approved, started, paused, edited and synced through the Meta Marketing API (Graph `v25.0`, override with `META_ADS_GRAPH_VERSION`). No new environment variable or dependency. The Meta app and OAuth login are configured in Platform Console > Connections; the login must grant `ads_management` (and `ads_read`) and the ad account must be connected in ViralPulse > Settings > Connected accounts. Your own ad accounts work with Standard access; managing other businesses' ad accounts needs Advanced access (App Review plus Business Verification). Meta's Marketing API Access Tier (renamed Limited / Full Access) keeps Full Access only with at least 500 calls in 15 days and an error rate under 15%. Before anything can spend, an admin must set a spending limit per currency (or explicitly allow uncapped launches) and a person with the new "Approve ad spend" permission (managers and admins) must approve the budget. Google Ads, LinkedIn and X only have request validators (they need the platform's own approval). A new scheduled job `viralpulse-ads` (every 30 minutes, `/api/viralpulse-ai/ads/cron`, listed in vercel.json) reads ad status and review feedback and writes daily results to `smms_metric_snapshots`. Field-by-field spec: `src/lib/products/viralpulse-ai/ads-platforms/SPEC.md`. New collections: `smms_ad_launches`, `smms_ad_sync_runs`, `smms_metric_snapshots`. The "Mark live" button is now an audited "manually tracked" override that is refused for Facebook and Instagram. Tests: `npm run test:viralpulse` runs a fake in-memory Meta server (WP6a suite); no provider is contacted.
- **Demo data:** `scripts/demo-seeders.ts` now refuses any company not flagged as demo (`node --env-file=.env.local scripts/mark-demo-company.mjs <slug>`) and any production environment.

## 14c. Playbook documents (editor and Word export): what an install needs

- **New dependencies** (installed by `npm install`, nothing else to add): `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table` (the document editor, ProseMirror based) and `docx` (Word export). All are **MIT**; only the free TipTap packages are used (TipTap's paid comments and DOCX-export extensions are not installed and not needed). `docx` is listed in `serverExternalPackages` in `next.config.ts`, like the other large server libraries, so it loads from `node_modules` at run time.
- **No new environment variable, cron job or build step.** New collections are created on first use (`pb_*`); the three that use fixed `_id`s (`pb_counters`, `pb_settings`, `pb_brand`) are registered in `KEYED_COLLECTIONS`.
- **Fonts:** Noto Sans and Noto Serif (Regular, Bold, Italic, Bold Italic; SIL OFL, `src/lib/fonts/noto/`, about 6 MB) are bundled and read by path at run time; the render routes list them in `outputFileTracingIncludes`. Brand images (logo, signature, stamp) go to the private Blob store under `playbook-brand/<companyId>/`; no new variable or dependency.
- **Tests:** `npm run test:playbook` (pure; no database, no network). It checks tenancy registration, permissions, dependency licences, the document model with golden files in `scripts/fixtures/playbook/`, and that client files never import server-only modules.

---

## 14d. ContractFlow (signing and vault) and the stamp rulebook: what an install needs
No new environment variable, package or cron. New collections: `cf_*` (company-scoped; `cf_settings` and `cf_counters` are keyed) and the global `stamp_rulebook`; indexes are created on first use. The public signer link is `/sign/<token>` (works on any host; the company comes from the signature request). Console: **Stamp rulebook** with three permissions (`stamp.read`, `stamp.edit`, `stamp.confirm`); it ships with the state and union-territory list and no duty amounts. The earlier `lpms_*` data is untouched; `planLpmsArchive()` (read-only) reports what exists. Clones: a Playbook version is copied into `cf_documents` (`/contractflow-ai/clones`), edited with the shared editor until the first signature (then locked in the data layer), with an edit audit in `cf_clone_edits`; PDF and Word downloads use the Playbook renderers. Tests: `npm run test:contractflow` (throwaway database only).

## 14e. Playbook SOPs / Documents / KPIs and ContractFlow lists, versions, AI edit, sealing: what an install needs
No new package, environment variable or cron. New collections (company-scoped, random ids): `cf_clone_versions`, `cf_clone_chat`; `cf_sealed` is now used (one signed PDF per clone, stored privately under `contractflow-sealed/<company>/`), plus the platform-level lookup `contractflow_seal_index` (verification code to company, read by the public `/verify/<code>` page). `pb_documents` gained optional `kind` (`sop`, `document`, `kpi`) and `meta`; records without `kind` are documents. The email layer accepts file attachments (`EmailMessage.files`, used for the signed PDF) with Resend, SendGrid and SMTP. The "Edit with AI" prompt is `playbook.edit.chat` in the prompt registry. The prebuilt SOP and KPI libraries are code (`src/lib/products/playbook-ai/item-library/`); adding an entry is adding a data object there.

**Edit with AI attachments:** no new package. Files are checked by content, stored privately under `playbook-chat/<company>/`, Word text is read with the existing `jszip`; images and PDFs go to the model as vision/file input. The Server Action body limit (16 MB in `next.config`) caps a message at 15 MB of attachments. New collection `pb_edit_chat` (Playbook chat); `cf_clone_chat` rows now also hold attachment names, sizes and storage keys.

## 15. Keeping this guide current

When the build scripts, commands, options, output folders or install steps change, this file changes in the same commit. If you add a
new `npm run build:…` command, add it to the Quick start, the quick reference (section 10) and the install section (section 12).

## ViralPulse Analytics sync (cron `viralpulse-metrics`)
Run `npm run cron:sync` after pulling this change so `vercel.json` has the daily `0 9 * * *` entry. On Vercel Hobby, the analytics sync runs once daily. No new env var. To test: `npm run test:viralpulse` (includes `scripts/test-viralpulse-wp7.ts`, throwaway DB `zz_throwaway_vpwp7`, fake platform server). Platforms need the analytics permissions listed in `src/lib/products/viralpulse-ai/metrics/SPEC.md` (Meta `instagram_manage_insights` + `read_insights`, Google `yt-analytics.readonly`, LinkedIn Community Management API approval); without them the account shows a plain "not synced yet" reason.
