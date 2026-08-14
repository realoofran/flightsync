// electron/lib/db.js
//
// Local persistence via lowdb (flat JSON file — no native build step, so it
// doesn't fight electron-builder's native-module rebuild process the way
// better-sqlite3 can). Store lives in Electron's userData dir, NOT in the
// app install directory.
//
// Swap-out note: if the library grows past a few thousand addons and JSON
// read/write starts to feel slow, migrate this module to better-sqlite3.
// Every call in here is already async so the call sites won't need to change.

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { regionForIcao } from './icaoRegions.js';
import { buildCorpusTokenCounts, recordLearnedPattern } from './learnedPatterns.js';

/** @type {Low|null} */
let db = null;

const DEFAULT_DATA = {
  settings: {
    communityPath: null,   // the user's one real MSFS Community folder — this is the only folder they ever need to point the app at
    vaultPath: null,       // hidden sibling folder FlightSync manages automatically — see addonScanner.js migration logic. Auto-derived from communityPath, never set by the user directly.
    simbriefPilotId: null,
    vatsimCid: null,       // user's own VATSIM CID — used only to look up THEIR pilot session in the public data feed, never sent anywhere
    aiApiKey: null,        // user's own Anthropic API key, used only by the opt-in "Classify with AI" step — never bundled into the app
    includeAlternates: true,
    theme: 'dark',         // 'dark' | 'light' | 'high-contrast'
    language: 'en',        // 'en' | 'de' | 'tr'
    onboardingComplete: false,
    minimizeToTray: false, // if true, closing the window hides to the system tray instead of quitting
    notifyOnMsfsLaunch: true,  // native notification + in-app banner when MSFS 2024 starts
    autoSyncOnLaunch: false,   // if true AND a sync preview with pending changes is already loaded, apply it automatically when MSFS starts
    soundEnabled: false,       // opt-in synthesized chime on sync-complete / MSFS launch — off by default, no audio asset, see src/lib/chime.js
    includeEnroute: false,     // opt-in: also match scenery near any route waypoint, not just origin/destination/alternates — see flightMatcher.js's findEnrouteIcaos(). Only ever applies to SimBrief-pulled plans (the only source with routePoints).
  },
  addons: {},        // id -> Addon  (see addonScanner.js)
  syncHistory: [],   // { timestamp, plan summary, result } — last 50 kept
  flightLog: [],      // { timestamp, origin, destination, aircraftIcao, airlineIcao, callsign, distanceNm } — last 200 kept, see recordFlight()
  loadouts: [],        // { id, name, addonIds, createdAt } — named addon sets the user can re-apply without a flight plan, see createLoadout()
  // token -> confirmed value, learned from this user's own manual
  // confirmations and consulted as a last-resort fallback on future scans
  // (never shared/bundled) — see learnedPatterns.js and confirmAddonMatch().
  learnedTokens: { icao: {}, aircraftType: {}, airline: {} },
};

/**
 * @param {string} userDataPath  Electron's app.getPath('userData')
 */
export async function initDb(userDataPath) {
  const file = path.join(userDataPath, 'flightsync-db.json');
  const adapter = new JSONFile(file);
  // lowdb's Low constructor stores the defaultData argument by reference,
  // not a copy — when no DB file exists yet it becomes db.data verbatim. If
  // that were the shared module-level DEFAULT_DATA constant, every fresh
  // initDb() call in the same process (multiple installs sharing a dev
  // process, or just re-initializing) would read and mutate the exact same
  // object graph. Clone it per call so each DB instance is independent.
  db = new Low(adapter, structuredClone(DEFAULT_DATA));
  await db.read();
  db.data ||= structuredClone(DEFAULT_DATA);
  // Migration: onboardingComplete didn't exist before v1.0.0. Treat any
  // existing DB that already has a communityPath configured as already
  // onboarded, so upgrading users don't see the first-run wizard again.
  // Must run BEFORE the generic backfill below — that backfill would
  // otherwise set onboardingComplete to the plain default (false) first,
  // and this check would never see it as missing.
  if (db.data.settings.onboardingComplete === undefined) {
    db.data.settings.onboardingComplete = Boolean(db.data.settings.communityPath);
  }
  // Backfill any OTHER settings field added in a version newer than this DB
  // file — confirmed as a REAL live bug, not theoretical: every settings
  // key added since the very first release (aiApiKey, minimizeToTray,
  // notifyOnMsfsLaunch, autoSyncOnLaunch, ...) was silently `undefined` for
  // any user who saved a db.json before that key existed, since a shallow
  // `db.data ||=` above only helps when the WHOLE file is missing, not when
  // it exists but predates a newer field. Existing values always win — this
  // only fills in gaps, never overwrites what the user already has.
  db.data.settings = { ...DEFAULT_DATA.settings, ...db.data.settings };
  db.data.flightLog ??= [];
  db.data.loadouts ??= [];
  db.data.learnedTokens ??= structuredClone(DEFAULT_DATA.learnedTokens);
  db.data.learnedTokens.icao ??= {};
  db.data.learnedTokens.aircraftType ??= {};
  db.data.learnedTokens.airline ??= {};
  await db.write();
  return db;
}

export function getDb() {
  if (!db) throw new Error('DB not initialized — call initDb() first at app startup.');
  return db;
}

/**
 * The vault lives as a hidden sibling of the Community folder (same parent
 * directory) — guarantees it's on the same filesystem/drive as Community,
 * so migrating addons in and out is a fast metadata-only move, never a
 * cross-drive copy.
 */
export function deriveVaultPath(communityPath) {
  if (!communityPath) return null;
  const parent = path.dirname(communityPath);
  return path.join(parent, '.flightsync-vault');
}

/**
 * Merges freshly scanned addons into the store AND removes any previously
 * known addon that no longer showed up in this scan (deleted, moved out of
 * the vault by hand, etc.) — this is what makes "Rescan" actually reflect
 * reality instead of accumulating stale ghost entries forever.
 */
export async function upsertScannedAddons(scannedAddons) {
  const { data } = getDb();
  const scannedIds = new Set(scannedAddons.map(a => a.id));

  for (const addon of scannedAddons) {
    const existing = data.addons[addon.id];

    if (existing && existing.confirmed && existing.manifestHash === addon.manifestHash) {
      // Unchanged on disk AND already confirmed — keep the user's prior
      // confirmation/overrides, don't overwrite with a freshly (re-)computed
      // heuristic guess. Name conflicts are a property of the *current* scan
      // (another addon may have appeared/disappeared with the same folder
      // name since last time), so that one field always tracks the fresh
      // value regardless.
      existing.nameConflict = addon.nameConflict;
      continue;
    }
    if (existing && existing.confirmed && existing.manifestHash !== addon.manifestHash) {
      // Addon was updated — re-scan it but preserve manual overrides the
      // user is likely to want kept (alwaysActive), reset confirmation.
      data.addons[addon.id] = { ...addon, alwaysActive: existing.alwaysActive };
      continue;
    }
    // Never confirmed (new, or still sitting in the confirm queue) — always
    // take the fresh scan result, even if the file on disk hasn't changed.
    // Without this, a matching-algorithm improvement (new false-positive
    // word, a bug fix, etc.) would never actually apply to anything already
    // scanned — Rescan would just restore the exact same stale unconfirmed
    // guess forever, since manifestHash never changes for an untouched
    // addon folder.
    data.addons[addon.id] = existing ? { ...addon, alwaysActive: existing.alwaysActive } : addon;
  }

  for (const existingId of Object.keys(data.addons)) {
    if (!scannedIds.has(existingId)) {
      delete data.addons[existingId];
    }
  }

  await getDb().write();
}

/**
 * Merges AI-suggested classifications (from aiClassifier.js) back into the
 * library. Mirrors confirmAddonMatch's OTHER/alwaysActive rule so an
 * AI-confirmed "OTHER" addon behaves identically to a manually-confirmed
 * one. Only auto-confirms when the model reported high confidence AND the
 * type's identifying field actually resolved — anything less still lands in
 * the normal manual confirm queue, just pre-filled instead of blank.
 */
export async function applyAiClassifications(updates) {
  const { data } = getDb();
  let appliedCount = 0;

  for (const u of updates ?? []) {
    const existing = data.addons[u.id];
    if (!existing) continue;

    const contentType = u.contentType;
    const matchedIcao = contentType === 'SCENERY' ? u.matchedIcao : null;
    const matchedAircraftType = (contentType === 'AIRCRAFT' || contentType === 'LIVERY') ? u.matchedAircraftType : null;
    const matchedAirline = contentType === 'LIVERY' ? u.matchedAirline : null;

    const resolvedEnough = contentType === 'SCENERY'
      ? Boolean(matchedIcao)
      : contentType === 'OTHER'
        ? true
        : Boolean(matchedAircraftType);
    const shouldConfirm = u.confidence === 'high' && resolvedEnough;

    data.addons[u.id] = {
      ...existing,
      contentType,
      matchedIcao,
      matchedAircraftType,
      matchedAirline,
      region: contentType === 'SCENERY' && matchedIcao ? regionForIcao(matchedIcao) : null,
      confirmed: shouldConfirm ? true : existing.confirmed,
      alwaysActive: shouldConfirm && contentType === 'OTHER' ? true : existing.alwaysActive,
      aiClassified: true,
    };
    appliedCount++;
  }

  await getDb().write();
  return appliedCount;
}

export async function confirmAddonMatch(id, patch) {
  const { data } = getDb();
  const existing = data.addons[id];
  if (!existing) throw new Error(`Unknown addon id: ${id}`);
  // "OTHER" means the addon isn't tied to any route/aircraft (a utility mod,
  // sound pack, etc.) — it can never be matched by flightMatcher.js, so the
  // only sane behavior is to always keep it linked, same as a manually
  // flagged "always active" addon.
  const alwaysActive = patch.contentType === 'OTHER' ? true : existing.alwaysActive;
  const updated = { ...existing, ...patch, alwaysActive, confirmed: true };
  data.addons[id] = updated;
  learnFromConfirmation(data, existing, updated);
  await getDb().write();
  return updated;
}

/**
 * Feeds a manual confirmation back into learnedTokens whenever it resolves
 * something the heuristic scanner either missed entirely or got wrong —
 * i.e. genuinely new information, not just the user accepting an
 * already-correct pre-filled guess unchanged. See learnedPatterns.js for
 * why this is deliberately conservative about what actually gets learned.
 */
function learnFromConfirmation(data, existing, updated) {
  const text = `${existing.folderName ?? ''} ${existing.title ?? ''}`;
  const corpus = buildCorpusTokenCounts(Object.values(data.addons));

  if (updated.contentType === 'SCENERY' && updated.matchedIcao && updated.matchedIcao !== existing.matchedIcao) {
    recordLearnedPattern(data.learnedTokens.icao, text, updated.matchedIcao, corpus);
  }
  if (
    (updated.contentType === 'AIRCRAFT' || updated.contentType === 'LIVERY')
    && updated.matchedAircraftType && updated.matchedAircraftType !== existing.matchedAircraftType
  ) {
    recordLearnedPattern(data.learnedTokens.aircraftType, text, updated.matchedAircraftType, corpus);
  }
  if (updated.contentType === 'LIVERY' && updated.matchedAirline && updated.matchedAirline !== existing.matchedAirline) {
    recordLearnedPattern(data.learnedTokens.airline, text, updated.matchedAirline, corpus);
  }
}

export async function setAlwaysActive(id, value) {
  const { data } = getDb();
  if (!data.addons[id]) throw new Error(`Unknown addon id: ${id}`);
  data.addons[id].alwaysActive = value;
  await getDb().write();
  return data.addons[id];
}

/**
 * Transplants an addon's DB record onto a new id/folderName/absolutePath
 * after its vault folder was physically renamed (see main.js's
 * library:renameAddon, which does the actual fs.rename via
 * addonScanner.js's renameVaultFolder before calling this). The id changes
 * because it's a hash of the absolute path (addonScanner.js's hashPath) —
 * this preserves everything else (confirmed, alwaysActive, matchedIcao,
 * ...) across that id change instead of the rename silently dropping a
 * prior manual confirmation. Purely an in-memory/persisted state update —
 * no filesystem access here, consistent with the rest of this module.
 */
export async function applyAddonRename(id, newFolderName, newAbsolutePath, newId) {
  const { data } = getDb();
  const existing = data.addons[id];
  if (!existing) throw new Error(`Unknown addon id: ${id}`);
  delete data.addons[id];
  data.addons[newId] = { ...existing, id: newId, folderName: newFolderName, absolutePath: newAbsolutePath };
  await getDb().write();
  return data.addons[newId];
}

export async function recordSyncResult(summary) {
  const { data } = getDb();
  data.syncHistory.unshift({ timestamp: new Date().toISOString(), ...summary });
  data.syncHistory = data.syncHistory.slice(0, 50);
  await getDb().write();
}

/**
 * Appends one entry to the pilot logbook — called once per successful
 * sync:apply that had a flight plan attached (see main.js), not on every
 * file-link operation. Re-applying the same route with nothing left to
 * change still logs a flight: getting Community ready to fly it is the
 * real signal of intent, not whether any junctions happened to move.
 */
export async function recordFlight(entry) {
  const { data } = getDb();
  data.flightLog.unshift({ timestamp: new Date().toISOString(), ...entry });
  data.flightLog = data.flightLog.slice(0, 200);
  await getDb().write();
}

/**
 * A loadout is just a named, saved addon-id set — created from whatever a
 * sync preview resolved to (see main.js's library:createLoadout), not from
 * a bespoke selection UI. Applying one later reuses the exact same
 * computeSyncPlan/applySyncPlan pipeline a flight-plan sync does (see
 * loadout:preview/loadout:apply in main.js), so it's held to the same
 * "always preview before touching real files" rule as everything else.
 */
export async function createLoadout(name, addonIds) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('Loadout name cannot be empty.');
  if (!Array.isArray(addonIds) || addonIds.length === 0) {
    throw new Error('A loadout needs at least one addon.');
  }
  const { data } = getDb();
  const loadout = {
    id: randomUUID(),
    name: trimmed,
    addonIds: [...new Set(addonIds)],
    createdAt: new Date().toISOString(),
  };
  data.loadouts.push(loadout);
  await getDb().write();
  return loadout;
}

export async function deleteLoadout(id) {
  const { data } = getDb();
  data.loadouts = data.loadouts.filter(l => l.id !== id);
  await getDb().write();
}

export async function updateSettings(patch) {
  const { data } = getDb();
  const next = { ...data.settings, ...patch };
  // vaultPath auto-derives alongside communityPath by default (recommended:
  // guarantees same drive, so migration is a fast metadata-only move) —
  // unless the caller explicitly set vaultPath in this same patch, which
  // means the user deliberately chose a custom vault location via Settings.
  if (patch.communityPath !== undefined && patch.vaultPath === undefined) {
    next.vaultPath = deriveVaultPath(patch.communityPath);
  }
  data.settings = next;
  await getDb().write();
  return data.settings;
}
