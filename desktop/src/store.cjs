"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

/** Small JSON files in the app's data folder: settings, the last branding (so it opens offline) and notification state. */
const file = (name) => path.join(app.getPath("userData"), name);

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
}

function write(name, value) {
  try {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    const tmp = `${file(name)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file(name));
  } catch (err) {
    console.error(`[store] could not write ${name}`, err);
  }
}

const DEFAULTS = { origin: null, rootDomain: null, launchAtLogin: null, closeToTray: null, bounds: null, maximized: false, notifyCursor: null, seen: [] };

module.exports = {
  file,
  loadConfig: () => ({ ...DEFAULTS, ...read("config.json", {}) }),
  saveConfig: (patch) => {
    const next = { ...DEFAULTS, ...read("config.json", {}), ...patch };
    write("config.json", next);
    return next;
  },
  readJson: read,
  writeJson: write,
};
