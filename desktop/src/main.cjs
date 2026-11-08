"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, Tray, Menu, shell, session, ipcMain, nativeImage, screen } = require("electron");
const store = require("./store.cjs");
const { loadBrand, fetchJson } = require("./brand.cjs");
const { resolveWorkspace, DEFAULT_ROOT } = require("./address.cjs");
const { offlinePage } = require("./pages.cjs");
const { createNotifier, appBadge } = require("./notifier.cjs");

/**
 * The desktop app for a SelfRun Business workspace (Windows, macOS, Linux). One program for every company: which company it is,
 * and its name, icon and colours, come from the workspace at run time. A build made for one company (`npm run build:company`)
 * only pre-selects the workspace address (brand.json); it is still branded from the server.
 */
const isMac = process.platform === "darwin";
const argv = process.argv.slice(1);
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const debug = process.env.SELFRUN_DEBUG ? (...a) => console.log("[desktop]", ...a) : () => {};
const startHidden = argv.includes("--hidden") || (isMac && app.getLoginItemSettings().wasOpenedAtLogin);

function readEmbedded() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "brand.json"), "utf8"));
  } catch {
    return {};
  }
}
const embedded = readEmbedded();
const rootDomain = () => store.loadConfig().rootDomain || embedded.rootDomain || process.env.SELFRUN_ROOT_DOMAIN || DEFAULT_ROOT;

let win = null;
let setupWin = null;
/** The app's own icon, used by the connect screen and until a workspace has given its own. */
const DEFAULT_ICON = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png"));
let tray = null;
let origin = null;
let brand = null;
let unread = 0;
let quitting = false;
let retryTimer = null;
let brandTimer = null;
let switching = false;
let activateBound = false;
const notifier = createNotifier({ getOrigin: () => origin, getBrand: () => brand, onUnread: (n) => setUnread(n), onOpen: (url) => openInApp(url) });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(start).catch((err) => {
    console.error(err);
    app.quit();
  });
}

app.setAppUserModelId(embedded.appId || "com.selfrun.desktop");

// ── start ───────────────────────────────────────────────────────────────────

async function start() {
  const ua = session.defaultSession.getUserAgent().replace(/\sElectron\/\S+/, "");
  session.defaultSession.setUserAgent(`${ua} WorkspaceDesktop/${app.getVersion()}`);
  lockDownPermissions();

  const wanted = embedded.address || arg("address") || process.env.SELFRUN_ADDRESS || store.loadConfig().origin;
  if (wanted) {
    const found = /^https?:\/\//.test(wanted) ? { ok: true, origin: wanted.replace(/\/+$/, "") } : await resolveWorkspace(wanted, { rootDomain: rootDomain(), fetchJson });
    if (found.ok) return begin(found.origin);
  }
  showSetup();
}

async function begin(nextOrigin) {
  origin = nextOrigin;
  store.saveConfig({ origin });
  brand = await loadBrand(origin);
  applyCompanyDefaults();
  debug("brand", brand.name, brand.version, "icon:", Boolean(brand.icon));
  applyBrand();
  createWindow();
  notifier.start();
  brandTimer = setInterval(refreshBrand, 30 * 60_000);
  if (!activateBound) {
    activateBound = true;
    app.on("activate", () => showWindow());
  }
}

async function refreshBrand() {
  const next = await loadBrand(origin);
  if (next.version !== brand.version) {
    brand = next;
    applyBrand();
  }
}

// ── branding ────────────────────────────────────────────────────────────────

function applyBrand() {
  if (brand.icon) {
    if (isMac && app.dock) app.dock.setIcon(brand.icon.image);
    if (win) win.setIcon(brand.icon.image);
  }
  if (win) win.setBackgroundColor(brand.backgroundColor);
  app.setAboutPanelOptions({ applicationName: brand.name, applicationVersion: app.getVersion(), credits: brand.description || "", ...(brand.icon && !isMac ? { iconPath: brand.icon.path } : {}) });
  buildTray();
  buildMenu();
}

function setUnread(n) {
  if (n === unread) return;
  unread = n;
  appBadge(n);
  if (tray) tray.setToolTip(trayTooltip());
  buildTray();
}

const trayTooltip = () => (unread > 0 ? `${brand.name} — ${unread} unread` : brand.name);

// ── window ──────────────────────────────────────────────────────────────────

function restoreBounds() {
  const saved = store.loadConfig().bounds;
  const base = { width: 1280, height: 820 };
  if (!saved) return base;
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - 20 && saved.y >= a.y - 20 && saved.x + 100 < a.x + a.width && saved.y + 60 < a.y + a.height;
  });
  return visible ? saved : { width: saved.width || base.width, height: saved.height || base.height };
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) void shell.openExternal(u.toString());
  } catch {
    /* not a URL */
  }
}

function webPrefs() {
  return { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true };
}

function createWindow() {
  win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: brand.name,
    backgroundColor: brand.backgroundColor,
    ...(!isMac ? { icon: brand.icon ? brand.icon.image : DEFAULT_ICON } : {}),
    webPreferences: webPrefs(),
  });
  if (store.loadConfig().maximized) win.maximize();
  win.once("ready-to-show", () => {
    debug("ready-to-show", startHidden ? "(hidden)" : "");
    if (!startHidden) win.show();
  });

  const wc = win.webContents;
  wc.on("will-navigate", (e, url) => {
    if (!sameOrigin(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) return { action: "allow", overrideBrowserWindowOptions: { webPreferences: webPrefs(), ...(brand.icon && !isMac ? { icon: brand.icon.image } : {}) } };
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
    debug("did-fail-load", code, desc, isMainFrame);
    if (!isMainFrame || code === -3) return; // -3: a navigation that was replaced by another
    showOffline(desc);
  });
  wc.on("did-finish-load", () => {
    debug("did-finish-load", wc.getURL());
    if (sameOrigin(wc.getURL())) {
      clearRetry();
      notifier.pollNow();
    }
  });

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      store.saveConfig({ bounds: win.isMaximized() ? store.loadConfig().bounds : win.getBounds(), maximized: win.isMaximized() });
    }, 400);
  };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("close", (e) => {
    if (!quitting && store.loadConfig().closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => {
    win = null;
    if (!isMac && !quitting && !switching) app.quit();
  });

  loadApp();
}

function loadApp() {
  if (!win) return;
  const start = brand.startUrl && brand.startUrl.startsWith("/") ? brand.startUrl : "/workspace";
  void win.loadURL(`${origin}${start}`).catch(() => {}); // failures are shown by did-fail-load
}

function showOffline(detail) {
  if (!win || win.isDestroyed()) return;
  const html = offlinePage(brand, { host: new URL(origin).host, detail });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  clearRetry();
  retryTimer = setTimeout(loadApp, 15_000);
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function showWindow() {
  if (!win) return origin ? createWindow() : showSetup();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Opens a path of the workspace (from a notification, the tray or the menu). Only paths: never another site. */
function openInApp(url) {
  const path = typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/workspace";
  showWindow();
  if (win) void win.loadURL(`${origin}${path}`).catch(() => {});
}

// ── permissions ─────────────────────────────────────────────────────────────

/** The workspace may use notifications, clipboard, fullscreen and the camera/microphone/screen for calls; nothing else. */
function lockDownPermissions() {
  const allowed = new Set(["notifications", "media", "mediaKeySystem", "clipboard-sanitized-write", "fullscreen", "display-capture", "speaker-selection"]);
  const trusted = (url) => {
    try {
      return Boolean(origin) && new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(allowed.has(permission) && trusted(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => allowed.has(permission) && (requestingOrigin === origin || (wc ? trusted(wc.getURL()) : false)));
}

// ── tray and menu ───────────────────────────────────────────────────────────

function trayImage() {
  const base = brand.icon ? brand.icon.image : nativeImage.createEmpty();
  if (base.isEmpty()) return base;
  const size = isMac ? 18 : process.platform === "win32" ? 16 : 22;
  return base.resize({ width: size, height: size, quality: "best" });
}

function buildTray() {
  if (!brand) return;
  if (!tray) {
    tray = new Tray(trayImage());
    tray.on("click", () => showWindow());
  } else {
    tray.setImage(trayImage());
  }
  tray.setToolTip(trayTooltip());
  const cfg = store.loadConfig();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${brand.name}`, click: () => showWindow() },
      { label: unread > 0 ? `Notifications (${unread} unread)` : "Notifications", click: () => openInApp("/workspace/notifications") },
      ...(brand.shortcuts && brand.shortcuts.length ? [{ type: "separator" }, ...brand.shortcuts.filter((s) => s.url !== "/workspace/notifications").map((s) => ({ label: s.name, click: () => openInApp(s.url) }))] : []),
      { type: "separator" },
      { label: "Start when I sign in", type: "checkbox", checked: cfg.launchAtLogin, click: (item) => setLaunchAtLogin(item.checked) },
      { label: "Keep running in the tray when closed", type: "checkbox", checked: cfg.closeToTray, click: (item) => store.saveConfig({ closeToTray: item.checked }) },
      ...(embedded.address ? [] : [{ label: "Change workspace…", click: () => changeWorkspace() }]),
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

/** First start on this computer: take the company's defaults for the tray options (after that the person's own choice wins). */
function applyCompanyDefaults() {
  const cfg = store.loadConfig();
  const d = brand.desktop || {};
  if (cfg.closeToTray === null) store.saveConfig({ closeToTray: d.closeToTray !== false });
  if (cfg.launchAtLogin === null) setLaunchAtLogin(d.launchAtLogin === true);
}

function setLaunchAtLogin(on) {
  store.saveConfig({ launchAtLogin: on });
  try {
    app.setLoginItemSettings({ openAtLogin: on, args: on ? ["--hidden"] : [] });
  } catch (err) {
    console.error("[login item]", err.message);
  }
}

function buildMenu() {
  const name = brand.name;
  const goItems = [
    ...(brand.shortcuts || []).map((s) => ({ label: s.name, click: () => openInApp(s.url) })),
    ...((brand.shortcuts || []).some((s) => s.url === "/workspace/notifications") ? [] : [{ label: "Notifications", click: () => openInApp("/workspace/notifications") }]),
  ];
  const changeItem = embedded.address ? [] : [{ label: "Change workspace…", click: () => changeWorkspace() }];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [{ label: name, submenu: [{ role: "about" }, { type: "separator" }, ...changeItem, ...(changeItem.length ? [{ type: "separator" }] : []), { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
        : [{ label: "File", submenu: [{ label: "Open in browser", click: () => openExternal(origin) }, ...changeItem, { type: "separator" }, { role: "quit" }] }]),
      { role: "editMenu" },
      { label: "Go", submenu: goItems },
      { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }])] },
      { role: "windowMenu" },
      { label: "Help", submenu: [{ label: `${name} on the web`, click: () => openExternal(origin) }] },
    ]),
  );
}

// ── choosing a workspace ────────────────────────────────────────────────────

function showSetup() {
  if (setupWin && !setupWin.isDestroyed()) return setupWin.focus();
  setupWin = new BrowserWindow({ width: 640, height: 720, minWidth: 480, minHeight: 600, center: true, minimizable: true, maximizable: false, title: "Connect your workspace", ...(!isMac ? { icon: DEFAULT_ICON } : {}), webPreferences: webPrefs() });
  setupWin.setMenu(null);
  void setupWin.loadFile(path.join(__dirname, "pages", "setup.html"));
  setupWin.on("closed", () => {
    setupWin = null;
    if (!origin) app.quit();
  });
}

async function changeWorkspace() {
  notifier.stop();
  clearInterval(brandTimer);
  store.saveConfig({ origin: null });
  origin = null;
  switching = true;
  if (win) {
    win.destroy();
    win = null;
  }
  switching = false;
  showSetup();
}

ipcMain.handle("setup:submit", async (event, value) => {
  // Only our own setup screen may choose a workspace.
  if (!event.senderFrame || !event.senderFrame.url.startsWith("file://") || !event.senderFrame.url.endsWith("setup.html")) return { ok: false, error: "Not allowed." };
  const found = await resolveWorkspace(String(value || ""), { rootDomain: rootDomain(), fetchJson });
  if (!found.ok) return found;
  notifier.reset();
  const w = setupWin;
  setupWin = null;
  if (w && !w.isDestroyed()) {
    w.removeAllListeners("closed"); // closing the setup window after success must not quit the app
    w.destroy();
  }
  await begin(found.origin);
  return { ok: true };
});

ipcMain.on("app:retry", (event) => {
  if (!event.senderFrame || !event.senderFrame.url.startsWith("data:text/html")) return;
  clearRetry();
  loadApp();
});

app.on("before-quit", () => {
  quitting = true;
  notifier.stop();
});
app.on("window-all-closed", () => {
  /* the tray keeps the app running; quitting is explicit */
});
