// electron/preload.cjs
//
// Deliberately CommonJS (.cjs), NOT ESM, even though the rest of this
// project uses "type": "module". Electron's preload process model is the
// most compatibility-sensitive part of the whole app — ESM preload support
// is still uneven across Electron versions and can fail silently (no error
// dialog, no crash — window.flightsync just never gets created). CommonJS
// preload has been universally supported for years, so we pin to that here
// rather than fighting Electron's ESM preload edge cases.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flightsync', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    detectCommunityPath: () => ipcRenderer.invoke('settings:detectCommunityPath'),
    exportBackup: () => ipcRenderer.invoke('settings:exportBackup'),
    importBackup: () => ipcRenderer.invoke('settings:importBackup'),
  },
  app: {
    getLaunchAtLogin: () => ipcRenderer.invoke('app:getLaunchAtLogin'),
    setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:setLaunchAtLogin', enabled),
  },
  dialog: {
    pickFolder: (title) => ipcRenderer.invoke('dialog:pickFolder', { title }),
  },
  shell: {
    openFolder: (path) => ipcRenderer.invoke('shell:openFolder', { path }),
  },
  library: {
    scan: () => ipcRenderer.invoke('library:scan'),
    list: () => ipcRenderer.invoke('library:list'),
    removeBrokenLink: (path) => ipcRenderer.invoke('library:removeBrokenLink', { path }),
    getFolderSizes: () => ipcRenderer.invoke('library:getFolderSizes'),
    listLoadouts: () => ipcRenderer.invoke('library:listLoadouts'),
    createLoadout: (name, addonIds) => ipcRenderer.invoke('library:createLoadout', { name, addonIds }),
    deleteLoadout: (id) => ipcRenderer.invoke('library:deleteLoadout', { id }),
    // Fires when the tray's "Rescan Community" menu item completes a scan
    // outside the normal Library-tab flow, so the UI can pick up the fresh
    // results without the user having to click Rescan again themselves.
    onRescanned: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('library:rescanned', listener);
      return () => ipcRenderer.removeListener('library:rescanned', listener);
    },
  },
  addon: {
    confirmMatch: (id, patch) => ipcRenderer.invoke('addon:confirmMatch', { id, patch }),
    setAlwaysActive: (id, value) => ipcRenderer.invoke('addon:setAlwaysActive', { id, value }),
  },
  ai: {
    classifyUnresolved: () => ipcRenderer.invoke('ai:classifyUnresolved'),
  },
  simbrief: {
    fetchLatest: () => ipcRenderer.invoke('simbrief:fetchLatest'),
  },
  sync: {
    preview: (plan) => ipcRenderer.invoke('sync:preview', { plan }),
    apply: (syncPlan) => ipcRenderer.invoke('sync:apply', { syncPlan }),
    history: () => ipcRenderer.invoke('sync:history'),
    undo: () => ipcRenderer.invoke('sync:undo'),
  },
  loadout: {
    preview: (id) => ipcRenderer.invoke('loadout:preview', { id }),
  },
  flightLog: {
    record: (entry) => ipcRenderer.invoke('flightLog:record', entry),
    list: () => ipcRenderer.invoke('flightLog:list'),
  },
  flightCard: {
    save: (pngArrayBuffer, suggestedName) => ipcRenderer.invoke('flightCard:save', pngArrayBuffer, suggestedName),
  },
  vatsim: {
    getAtcStatus: (icaos) => ipcRenderer.invoke('vatsim:getAtcStatus', { icaos }),
    fetchMyFlightPlan: () => ipcRenderer.invoke('vatsim:fetchMyFlightPlan'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    // Returns an unsubscribe function — callers must call it on unmount to
    // avoid stacking duplicate listeners across renderer re-renders.
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    },
  },
  msfs: {
    // Fires once when MSFS 2024 is detected starting (main process polls
    // for it) — never repeats while it's still running.
    onLaunched: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('msfs:launched', listener);
      return () => ipcRenderer.removeListener('msfs:launched', listener);
    },
  },
});

// Marker the renderer can check to know the preload bridge actually ran,
// as opposed to window.flightsync simply being undefined for any other
// reason. See src/lib/mockBridge.js getBridge().
contextBridge.exposeInMainWorld('__flightsyncPreloadOk', true);
