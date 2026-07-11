/**
 * Preload — safe bridge for the desktop shell (Mac & Windows).
 * No Node APIs exposed to the page by default.
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("posDesktop", {
  isDesktop: true,
  platform: process.platform,
});

// Mark document so CSS can adjust if needed (no traffic-light overlay)
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("pos-desktop");
  if (process.platform === "darwin") {
    document.documentElement.classList.add("pos-desktop-mac");
  }
});
