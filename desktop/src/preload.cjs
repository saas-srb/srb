"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/** The only thing pages get from the desktop app: a flag and two requests. No Node, no file access. */
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  retry: () => ipcRenderer.send("app:retry"),
  submitAddress: (value) => ipcRenderer.invoke("setup:submit", String(value ?? "").slice(0, 300)),
});
