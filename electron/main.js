// electron/main.js
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import { initDb, getDb, upsertScannedAddons, confirmAddonMatch, setAlwaysActive, recordSyncResult, updateSettings, applyAiClassifications } from './lib/db.js';
import { scanLibrary } from './lib/addonScanner.js';
import { computeSyncPlan, applySyncPlan } from './lib/symlinkManager.js';
import { fetchLatestOfp } from './lib/simbriefClient.js';
import { resolveRequiredAddons, findPendingConfirmations } from './lib/flightMatcher.js';
import { classifyAddonsWithAI } from './lib/aiClassifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: '#0B0E14',
    icon: path.join(__dirname, '../build/icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B0E14', symbolColor: '#8B93A1', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needs to be false for the preload to reach fs-touching IPC calls
    },
  });

  // If the preload script itself throws (syntax error, bad require, etc.)
  // Electron does NOT crash or show a dialog — window.flightsync would
  // just silently never exist, and the renderer would silently fall back
  // to mock data with zero indication anything went wrong. Surface it loudly
  // instead: this printed exactly this class of bug during development
  // (preload.js was ESM in a "type": "module" project and failed to load).
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[FlightSync] PRELOAD FAILED TO LOAD: ${preloadPath}`);
    console.error(error);
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDb(app.getPath('userData'));
  await createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Auto-update (electron-updater, GitHub Releases feed — see package.json's
// build.publish config)
// ---------------------------------------------------------------------------

/**
 * electron-updater only works against a real packaged app with a publish
 * feed configured (it reads app-update.yml, which electron-builder only
 * generates for a real build) — in dev mode, or before a GitHub repo is
 * actually configured, every check would just fail with a confusing error.
 * Guarded on isPackaged, and the module itself is loaded lazily (not at
 * top-level import) and wrapped defensively: electron-updater behaves
 * differently depending on how/when it's loaded relative to app readiness,
 * and this whole feature existing only to break app startup would be worse
 * than just not having it — every path here is try/catch'd so a problem
 * with updates can never take down the rest of the app.
 */
let autoUpdaterInstance = null;

async function getAutoUpdater() {
  if (autoUpdaterInstance) return autoUpdaterInstance;
  // electron-updater's main.js exposes `autoUpdater` via a lazy getter
  // (constructing the real updater on first access), not a plain property.
  // Node's ESM/CJS interop derives named exports from static analysis of
  // the CJS module and does NOT reliably detect getter-defined exports —
  // confirmed directly: `import('electron-updater').then(m => m.autoUpdater)`
  // is undefined, while `m.default.autoUpdater` correctly triggers the
  // getter and returns the real instance. Always go through `.default`.
  const mod = await import('electron-updater');
  const autoUpdater = mod.default?.autoUpdater ?? mod.autoUpdater;
  if (!autoUpdater) throw new Error('electron-updater did not export autoUpdater');
  autoUpdaterInstance = autoUpdater;
  return autoUpdaterInstance;
}

async function setupAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    const autoUpdater = await getAutoUpdater();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    const send = (payload) => mainWindow?.webContents.send('updater:status', payload);

    autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
    autoUpdater.on('update-not-available', () => send({ state: 'up-to-date' }));
    autoUpdater.on('download-progress', (progress) => send({ state: 'downloading', percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
    autoUpdater.on('error', (err) => send({ state: 'error', message: err.message }));

    // Check once, shortly after launch — delayed so it never competes with
    // the app's own startup (DB init, window paint) for attention or network.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => console.error('[FlightSync] Update check failed:', err.message));
    }, 5000);
  } catch (err) {
    console.error('[FlightSync] Auto-updater failed to initialize (app continues normally without it):', err.message);
  }
}

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return { state: 'unavailable', message: 'Updates only run in the packaged app, not in dev mode.' };
  try {
    const autoUpdater = await getAutoUpdater();
    await autoUpdater.checkForUpdates();
    return { state: 'checking' };
  } catch (err) {
    return { state: 'error', message: err.message };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    const autoUpdater = await getAutoUpdater();
    autoUpdater.quitAndInstall();
  } catch (err) {
    console.error('[FlightSync] Failed to install update:', err.message);
  }
});

// ---------------------------------------------------------------------------
// IPC: settings & folder pickers
// ---------------------------------------------------------------------------

ipcMain.handle('settings:get', () => getDb().data.settings);
ipcMain.handle('settings:update', (_e, patch) => updateSettings(patch));

ipcMain.handle('dialog:pickFolder', async (_e, { title }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('settings:detectCommunityPath', async () => {
  return detectCommunityPath();
});

// Lets the UI open the vault (or Community) folder directly in Explorer —
// makes the "your addons live here, Community just has links" explanation
// concrete instead of asking the user to trust a sentence of prose.
ipcMain.handle('shell:openFolder', async (_e, { path: targetPath }) => {
  if (!targetPath) return { ok: false, error: 'No path set yet.' };
  const result = await shell.openPath(targetPath);
  return result ? { ok: false, error: result } : { ok: true };
});

/**
 * Tries every location FlightSync knows how to find automatically, in order
 * of how likely each is to actually be right — checked and confirmed
 * against a real MSFS 2024 install during development:
 *
 *  1. %APPDATA%\Microsoft Flight Simulator 2024\Packages\Community — the
 *     real, unified location MSFS 2024 uses for BOTH the Microsoft Store
 *     and Steam versions (unlike MSFS 2020, which split this by storefront
 *     under %LOCALAPPDATA%\Packages\<package-id>\...). Confirmed on a real
 *     Steam install: the game's own install folder under
 *     steamapps\common\MSFS2024 does NOT contain Community at all — it
 *     lives here instead, regardless of storefront.
 *  2. The legacy MSFS-2020-style Microsoft Store package path, kept as a
 *     fallback in case some install configuration still uses it.
 *  3. Scanning every Steam library folder's steamapps\common for an MSFS
 *     install with its own Community subfolder — unlikely to hit given
 *     finding #1 above, but cheap to keep checking for robustness.
 *
 * Returns null (never throws) if nothing is found — callers fall back to
 * manual folder browsing either way, this is purely a convenience.
 */
async function detectCommunityPath() {
  return (
    (await detectRoamingCommunityPath()) ??
    (await detectMicrosoftStoreCommunityPath()) ??
    (await detectSteamCommunityPath())
  );
}

async function detectRoamingCommunityPath() {
  const appData = process.env.APPDATA;
  if (!appData) return null;

  for (const folderName of ['Microsoft Flight Simulator 2024', 'Microsoft Flight Simulator']) {
    const candidate = path.join(appData, folderName, 'Packages', 'Community');
    if (await isDirectory(candidate)) return candidate;
  }
  return null;
}

async function detectMicrosoftStoreCommunityPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const packagesDir = path.join(localAppData, 'Packages');
  let entries;
  try {
    entries = await fs.readdir(packagesDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter(e => e.isDirectory() && /^Microsoft\.(Limitless|FlightSimulator)_/.test(e.name))
    .map(e => path.join(packagesDir, e.name, 'LocalCache', 'Packages', 'Community'));

  for (const candidate of candidates) {
    if (await isDirectory(candidate)) return candidate;
  }
  return null;
}

/**
 * Steam doesn't use one fixed install location the way the MS Store package
 * does — the app itself can be on any drive, in any Steam "library folder"
 * the user has added (Steam > Settings > Storage). This finds every library
 * Steam knows about and checks each one for an MSFS install with a
 * Community folder, rather than assuming the default C:\ location. In
 * practice MSFS 2024's Steam version keeps Community under %APPDATA% (see
 * detectRoamingCommunityPath above), not inside its own install folder, but
 * this is kept as a fallback in case that ever changes or a specific setup
 * differs.
 */
async function detectSteamCommunityPath() {
  const steamPath = await findSteamInstallPath();
  if (!steamPath) return null;

  const libraryPaths = await findSteamLibraryFolders(steamPath);

  for (const library of libraryPaths) {
    const commonDir = path.join(library, 'steamapps', 'common');
    let entries;
    try {
      entries = await fs.readdir(commonDir, { withFileTypes: true });
    } catch {
      continue;
    }

    // Match by name rather than a fixed folder name — Steam's exact folder
    // naming for MSFS has varied in the wild ("Microsoft Flight Simulator",
    // "Microsoft Flight Simulator 2024", and — confirmed on a real Steam
    // install during development — the abbreviated "MSFS2024"). Prefer a
    // 2024 match if both an old and new install happen to be present.
    const msfsFolders = entries
      .filter(e => e.isDirectory() && /flight\s*simulator|^msfs/i.test(e.name))
      .sort((a, b) => Number(b.name.includes('2024')) - Number(a.name.includes('2024')));

    for (const folder of msfsFolders) {
      const candidate = path.join(commonDir, folder.name, 'Community');
      if (await isDirectory(candidate)) return candidate;
    }
  }
  return null;
}

/** Reads Steam's own install path from the registry, falling back to the
 * two standard default locations if the registry lookup fails for any
 * reason (not installed, non-Windows dev environment, permissions, etc). */
async function findSteamInstallPath() {
  try {
    const { stdout } = await execFileAsync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (match) {
      const regPath = match[1].trim().replace(/\//g, '\\');
      if (await isDirectory(regPath)) return regPath;
    }
  } catch {
    // reg query failed (not on Windows, key missing, etc) — fall through to defaults
  }

  for (const fallback of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) {
    if (await isDirectory(fallback)) return fallback;
  }
  return null;
}

/** Parses steamapps/libraryfolders.vdf for every additional library the
 * user has added beyond the main Steam install folder. The VDF format is
 * simple enough that pulling quoted path strings with a regex is reliable
 * without needing a full VDF parser dependency. */
async function findSteamLibraryFolders(steamPath) {
  const libraries = [steamPath];
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

  try {
    const raw = await fs.readFile(vdfPath, 'utf-8');
    const pathMatches = [...raw.matchAll(/"path"\s+"([^"]+)"/gi)];
    for (const m of pathMatches) {
      const libPath = m[1].replace(/\\\\/g, '\\');
      if (!libraries.includes(libPath)) libraries.push(libPath);
    }
  } catch {
    // no libraryfolders.vdf (older Steam, or nothing added) — just the default install path
  }

  return libraries;
}

async function isDirectory(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IPC: library scanning & match confirmation
// ---------------------------------------------------------------------------

ipcMain.handle('library:scan', async () => {
  const { communityPath, vaultPath } = getDb().data.settings;
  if (!communityPath) throw new Error('Set your MSFS Community folder in Settings first.');

  const { addons: scanned, warnings } = await scanLibrary(communityPath, vaultPath);
  await upsertScannedAddons(scanned);
  return { addons: Object.values(getDb().data.addons), warnings };
});

ipcMain.handle('library:list', () => Object.values(getDb().data.addons));

ipcMain.handle('addon:confirmMatch', (_e, { id, patch }) => confirmAddonMatch(id, patch));
ipcMain.handle('addon:setAlwaysActive', (_e, { id, value }) => setAlwaysActive(id, value));

ipcMain.handle('ai:classifyUnresolved', async () => {
  const { aiApiKey } = getDb().data.settings;
  if (!aiApiKey) throw new Error('Set your Anthropic API key in Settings first.');

  const library = Object.values(getDb().data.addons);
  const { updates, classifiedCount, failedCount, errorMessage } = await classifyAddonsWithAI(library, aiApiKey);
  const appliedCount = await applyAiClassifications(updates);

  return {
    addons: Object.values(getDb().data.addons),
    classifiedCount,
    failedCount,
    appliedCount,
    errorMessage,
  };
});

// ---------------------------------------------------------------------------
// IPC: SimBrief + sync flow
// ---------------------------------------------------------------------------

ipcMain.handle('simbrief:fetchLatest', async () => {
  const { simbriefPilotId } = getDb().data.settings;
  if (!simbriefPilotId) throw new Error('Set your SimBrief pilot ID/username in Settings first.');
  return fetchLatestOfp(simbriefPilotId);
});

ipcMain.handle('sync:preview', async (_e, { plan }) => {
  const { communityPath, includeAlternates } = getDb().data.settings;
  if (!communityPath) throw new Error('Set your MSFS Community folder in Settings first.');

  const library = Object.values(getDb().data.addons);
  const required = resolveRequiredAddons(plan, library, { includeAlternates });
  const pendingConfirmation = findPendingConfirmations(plan, library);
  const syncPlan = await computeSyncPlan(communityPath, required, library);

  return { syncPlan, pendingConfirmation };
});

ipcMain.handle('sync:apply', async (_e, { syncPlan }) => {
  const { communityPath } = getDb().data.settings;
  if (!communityPath) throw new Error('Set your MSFS Community folder in Settings first.');

  const result = await applySyncPlan(communityPath, syncPlan);
  await recordSyncResult({
    linkedCount: result.linked.length,
    unlinkedCount: result.unlinked.length,
    errorCount: result.errors.length,
  });
  return result;
});

ipcMain.handle('sync:history', () => getDb().data.syncHistory);
