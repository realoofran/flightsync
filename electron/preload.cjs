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
});

// Marker the renderer can check to know the preload bridge actually ran,
// as opposed to window.flightsync simply being undefined for any other
// reason. See src/lib/mockBridge.js getBridge().
contextBridge.exposeInMainWorld('__flightsyncPreloadOk', true);
