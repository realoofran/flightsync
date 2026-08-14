// src/lib/mockBridge.js
//
// When running `vite dev` in a plain browser tab (not inside Electron),
// `window.flightsync` doesn't exist. This mock stands in so the UI is
// inspectable/iterable without spinning up the full Electron shell every
// time — genuinely useful during UI-only iteration. It is NEVER bundled
// into logic that touches a real filesystem; it just fakes the IPC shape.

const mockSettings = {
  communityPath: 'C:\\Users\\Devran\\AppData\\Roaming\\Microsoft Flight Simulator 2024\\Packages\\Community',
  vaultPath: 'C:\\Users\\Devran\\AppData\\Roaming\\Microsoft Flight Simulator 2024\\Packages\\.flightsync-vault',
  simbriefPilotId: '1598381',
  vatsimCid: '1234567',
  aiApiKey: null,
  includeAlternates: true,
  includeEnroute: false,
  theme: 'dark',
  language: 'en',
  onboardingComplete: true,
  minimizeToTray: false,
  notifyOnMsfsLaunch: true,
  autoSyncOnLaunch: false,
  soundEnabled: false,
};

let mockLaunchAtLogin = false;

const mockAddons = [
  { id: 'a1', folderName: 'fspro-eddm-munich', categoryPath: '', title: 'Munich Airport EDDM Enhanced', contentType: 'SCENERY', region: 'Europe', candidateIcaos: ['EDDM'], matchedIcao: 'EDDM', matchedAircraftType: null, matchedAirline: null, confirmed: true, alwaysActive: false, nameConflict: false },
  { id: 'a2', folderName: 'orbx-ltfm-istanbul', categoryPath: '', title: 'Istanbul Airport LTFM', contentType: 'SCENERY', region: 'Europe', candidateIcaos: ['LTFM'], matchedIcao: 'LTFM', matchedAircraftType: null, matchedAirline: null, confirmed: true, alwaysActive: false, nameConflict: false },
  { id: 'a3', folderName: 'fspro-eddf-frankfurt', categoryPath: 'Airports', title: 'Frankfurt Airport EDDF', contentType: 'SCENERY', region: 'Europe', candidateIcaos: ['EDDF'], matchedIcao: 'EDDF', matchedAircraftType: null, matchedAirline: null, confirmed: true, alwaysActive: false, nameConflict: true },
  { id: 'a3b', folderName: 'fspro-othh-doha', categoryPath: '', title: 'Doha Hamad International', contentType: 'SCENERY', region: 'Middle East', candidateIcaos: ['OTHH'], matchedIcao: 'OTHH', matchedAircraftType: null, matchedAirline: null, confirmed: true, alwaysActive: false, nameConflict: false },
  { id: 'a4', folderName: 'fbw-a21n-thy-liv', categoryPath: '', title: 'Turkish Airlines A321neo', contentType: 'LIVERY', region: null, candidateIcaos: [], matchedIcao: null, matchedAircraftType: 'A21N', matchedAirline: 'THY', confirmed: true, alwaysActive: false, nameConflict: false },
  { id: 'a5', folderName: 'fenix-a320-base', categoryPath: '', title: 'Fenix A320 Base Package', contentType: 'AIRCRAFT', region: null, candidateIcaos: [], matchedIcao: null, matchedAircraftType: 'A20N', matchedAirline: null, confirmed: true, alwaysActive: true, nameConflict: false },
  { id: 'a6', folderName: 'community-kjfk-unnamed-v2', categoryPath: '', title: 'Airport Enhancement Vol. 2', contentType: 'SCENERY', region: null, candidateIcaos: [], matchedIcao: null, matchedAircraftType: null, matchedAirline: null, confirmed: false, alwaysActive: false, nameConflict: false },
  { id: 'a7', folderName: 'custom-repaint-01', categoryPath: '', title: 'Custom Repaint Pack', contentType: 'LIVERY', region: null, candidateIcaos: [], matchedIcao: null, matchedAircraftType: null, matchedAirline: null, confirmed: false, alwaysActive: false, nameConflict: false },
  { id: 'a8', folderName: 'fspro-eddf-frankfurt', categoryPath: 'Backup', title: 'Frankfurt EDDF (old copy)', contentType: 'SCENERY', region: 'Europe', candidateIcaos: ['EDDF'], matchedIcao: 'EDDF', matchedAircraftType: null, matchedAirline: null, confirmed: true, alwaysActive: false, nameConflict: true },
];

let mockLoadouts = [
  { id: 'lo1', name: 'Winter Ops A320', addonIds: ['a1', 'a2', 'a5'], createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
];

const mockFlightLog = [
  { timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), origin: 'LTFM', destination: 'EDDM', aircraftIcao: 'A21N', airlineIcao: 'THY', callsign: 'THY1598', distanceNm: 897 },
  { timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), origin: 'EDDM', destination: 'EGLL', aircraftIcao: 'A20N', airlineIcao: null, callsign: null, distanceNm: 561 },
  { timestamp: new Date(Date.now() - 9 * 86400000).toISOString(), origin: 'KJFK', destination: 'EGLL', aircraftIcao: 'B738', airlineIcao: 'THY', callsign: 'THY1', distanceNm: 2991 },
];

export const mockBridge = {
  settings: {
    get: async () => ({ ...mockSettings }),
    update: async (patch) => {
      Object.assign(mockSettings, patch);
      return { ...mockSettings };
    },
    detectCommunityPath: async () =>
      'C:\\Users\\Devran\\AppData\\Roaming\\Microsoft Flight Simulator 2024\\Packages\\Community',
    exportBackup: async () => ({ ok: true, path: 'C:\\fake\\path\\flightsync-settings-2026-08-08.json' }),
    importBackup: async () => ({ ok: true, settings: { ...mockSettings } }),
  },
  app: {
    getLaunchAtLogin: async () => mockLaunchAtLogin,
    setLaunchAtLogin: async (enabled) => { mockLaunchAtLogin = enabled; },
  },
  dialog: {
    pickFolder: async () => 'C:\\fake\\path\\selected',
  },
  shell: {
    openFolder: async () => ({ ok: true }),
  },
  library: {
    scan: async () => ({
      addons: mockAddons,
      warnings: [
        { path: 'fspro-eddf-frankfurt', code: 'name-conflict', message: '"fspro-eddf-frankfurt" in Airports and Backup' },
        { path: 'community-kjfk-unnamed-v2', code: 'no-manifest', message: 'No manifest.json/layout.json anywhere inside' },
        { path: 'old-renamed-addon', code: 'broken-link', message: 'Points to "D:\\msfs mods\\old-renamed-addon", which no longer exists — moved, renamed, or deleted outside FlightSync.' },
      ],
    }),
    list: async () => mockAddons,
    removeBrokenLink: async () => {},
    renameAddon: async (id, newFolderName) => {
      const trimmed = (newFolderName ?? '').trim();
      if (!trimmed) throw new Error('New folder name cannot be empty.');
      if (/[\\/:*?"<>|]/.test(trimmed)) throw new Error('Folder name can\'t contain \\ / : * ? " < > |');
      const addon = mockAddons.find(a => a.id === id);
      if (!addon) throw new Error('Unknown addon.');
      const sibling = mockAddons.find(a => a.id !== id && a.folderName === trimmed && a.categoryPath === addon.categoryPath);
      if (sibling) throw new Error(`"${trimmed}" already exists in this location.`);
      addon.folderName = trimmed;
      // Recompute conflicts across the whole mock library, mirroring the
      // real markNameConflicts pass a rescan does server-side.
      const byName = new Map();
      for (const a of mockAddons) {
        if (!byName.has(a.folderName)) byName.set(a.folderName, []);
        byName.get(a.folderName).push(a);
      }
      for (const a of mockAddons) a.nameConflict = false;
      const warnings = [];
      for (const [folderName, group] of byName) {
        if (group.length < 2) continue;
        for (const a of group) a.nameConflict = true;
        warnings.push({ path: folderName, code: 'name-conflict', message: `"${folderName}" in ${group.map(a => a.categoryPath || '(root)').join(' and ')}` });
      }
      return { addons: [...mockAddons], warnings };
    },
    onRescanned: () => () => {},
    getFolderSizes: async () => ({
      a1: 1_800_000_000, a2: 2_100_000_000, a3: 950_000_000, a3b: 1_200_000_000,
      a4: 180_000_000, a5: 4_600_000_000, a6: 620_000_000, a7: 45_000_000, a8: 950_000_000,
    }),
    exportCsv: async () => ({ ok: true, path: 'C:\\fake\\path\\flightsync-library.csv' }),
    listLoadouts: async () => [...mockLoadouts],
    createLoadout: async (name, addonIds) => {
      const trimmed = (name ?? '').trim();
      if (!trimmed) throw new Error('Loadout name cannot be empty.');
      if (!addonIds || addonIds.length === 0) throw new Error('A loadout needs at least one addon.');
      const loadout = { id: `lo${Date.now()}`, name: trimmed, addonIds: [...new Set(addonIds)], createdAt: new Date().toISOString() };
      mockLoadouts.push(loadout);
      return loadout;
    },
    deleteLoadout: async (id) => { mockLoadouts = mockLoadouts.filter(l => l.id !== id); },
  },
  addon: {
    confirmMatch: async (id, patch) => {
      const base = mockAddons.find(a => a.id === id);
      const alwaysActive = patch.contentType === 'OTHER' ? true : base.alwaysActive;
      return { ...base, ...patch, alwaysActive, confirmed: true };
    },
    setAlwaysActive: async (id, value) => ({ ...mockAddons.find(a => a.id === id), alwaysActive: value }),
  },
  ai: {
    classifyUnresolved: async () => ({
      addons: mockAddons,
      classifiedCount: 2,
      failedCount: 0,
      appliedCount: 2,
      errorMessage: null,
    }),
  },
  simbrief: {
    fetchLatest: async () => ({
      origin: 'LTFM',
      destination: 'EDDM',
      alternates: ['EDDF'],
      aircraftIcao: 'A21N',
      airlineIcao: 'THY',
      callsign: 'THY1598',
      fetchedAt: new Date().toISOString(),
      source: 'simbrief',
      originCoord: { lat: 41.262, lon: 28.727 },
      destinationCoord: { lat: 48.354, lon: 11.786 },
      routePoints: [
        { ident: 'EZS', lat: 40.98, lon: 25.5 },
        { ident: 'SOFIA', lat: 42.7, lon: 23.3 },
        { ident: 'BUD', lat: 47.5, lon: 19.0 },
      ],
      ofp: {
        routeString: 'EZS UP975 SOFIA UM984 BUD UZ29 ROKIL DCT EDDM',
        distanceNm: 918,
        gcDistanceNm: 897,
        estTimeEnrouteSec: 8100,
        cruiseAltitudeFt: 36000,
        blockFuelLbs: 14200,
        tripFuelLbs: 11800,
        taxiFuelLbs: 400,
        reserveFuelLbs: 1600,
        alternateFuelLbs: 900,
        originName: 'Istanbul Airport',
        destinationName: 'Munich Airport',
        alternateIcao: 'EDDF',
        alternateName: 'Frankfurt Airport',
        taxiOutMin: 18,
        taxiInMin: 8,
        maxTowLbs: 205000,
        zfwLbs: 142300,
        towLbs: 156500,
        landingWeightLbs: 144700,
        paxCount: 168,
        cargoLbs: 4200,
        costIndex: 22,
        avgWindComponent: '-14',
        originMetar: 'LTFM 061620Z 24008KT 9999 FEW035 22/14 Q1015 NOSIG',
        destinationMetar: 'EDDM 061650Z 27006KT 9999 SCT040 18/11 Q1018 NOSIG',
        schedOutUtc: new Date(Date.now() + 30 * 60000).toISOString(),
        schedInUtc: new Date(Date.now() + 3 * 3600000).toISOString(),
      },
    }),
  },
  sync: {
    preview: async () => ({
      syncPlan: {
        toLink: [mockAddons[0], mockAddons[1], mockAddons[4]],
        toUnlink: [],
        unchanged: [mockAddons[5]],
      },
      pendingConfirmation: [mockAddons[6]],
    }),
    apply: async () => ({ linked: ['a1', 'a2', 'a4'], unlinked: [], errors: [] }),
    history: async () => ([
      {
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        linkedCount: 3, unlinkedCount: 2, errorCount: 0,
        linkedIds: ['a1', 'a2', 'a4'], unlinkedIds: ['a6', 'a7'],
      },
    ]),
    undo: async () => ({ linked: ['a6', 'a7'], unlinked: ['a1', 'a2', 'a4'], errors: [] }),
  },
  loadout: {
    preview: async (id) => {
      const loadout = mockLoadouts.find(l => l.id === id);
      if (!loadout) throw new Error('This loadout no longer exists.');
      const required = mockAddons.filter(a => loadout.addonIds.includes(a.id));
      return { syncPlan: { toLink: required, toUnlink: [], unchanged: [] }, loadoutName: loadout.name };
    },
  },
  flightLog: {
    record: async (entry) => { mockFlightLog.unshift({ timestamp: new Date().toISOString(), ...entry }); },
    list: async () => [...mockFlightLog],
  },
  flightCard: {
    save: async () => ({ ok: true, path: 'C:\\fake\\path\\flightsync-card.png' }),
  },
  vatsim: {
    fetchMyFlightPlan: async () => ({
      origin: 'KJFK',
      destination: 'EGLL',
      alternates: ['EGKK'],
      aircraftIcao: 'B738',
      airlineIcao: 'THY',
      callsign: 'THY1',
      fetchedAt: new Date().toISOString(),
      source: 'vatsim',
      originCoord: null,
      destinationCoord: null,
      routePoints: [],
      ofp: null,
    }),
    getAtcStatus: async (icaos) => {
      const sample = {
        LTFM: [{ callsign: 'LTFM_TWR', name: 'Istanbul Tower', frequency: 118.1, facility: 4 }],
        EDDM: [
          { callsign: 'EDDM_TWR', name: 'Munich Tower', frequency: 118.7, facility: 4 },
          { callsign: 'EDDM_APP', name: 'Munich Approach', frequency: 120.75, facility: 5 },
        ],
      };
      const result = {};
      for (const icao of icaos ?? []) result[icao] = sample[icao] ?? [];
      return result;
    },
    findByCallsign: async (query) => {
      const q = (query ?? '').trim().toUpperCase();
      if (!q) return [];
      const sample = [
        {
          origin: 'EDDF', destination: 'KJFK', alternates: ['KEWR'], aircraftIcao: 'A21N', airlineIcao: 'DLH',
          callsign: 'DLH4LR', fetchedAt: new Date().toISOString(), source: 'vatsim',
          originCoord: null, destinationCoord: null, routePoints: [], ofp: null,
          pilotName: 'Max Mustermann', pilotCid: 1234567, altitude: 37000, groundspeed: 452,
        },
        {
          origin: 'LTFM', destination: 'EDDM', alternates: [], aircraftIcao: 'A320', airlineIcao: 'THY',
          callsign: 'THY1598', fetchedAt: new Date().toISOString(), source: 'vatsim',
          originCoord: null, destinationCoord: null, routePoints: [], ofp: null,
          pilotName: 'Ayşe Yılmaz', pilotCid: 7654321, altitude: 34000, groundspeed: 421,
        },
      ];
      const exact = sample.filter(f => f.callsign === q);
      return exact.length > 0 ? exact : sample.filter(f => f.callsign.startsWith(q));
    },
  },
  updater: {
    check: async () => ({ state: 'unavailable', message: 'Updates only run in the packaged app, not in dev mode.' }),
    install: async () => {},
    onStatus: () => () => {},
  },
  msfs: {
    onLaunched: () => () => {},
  },
};

export function getBridge() {
  return globalThis.flightsync ?? mockBridge;
}

/**
 * True only when the real Electron preload bridge failed to load — as
 * opposed to intentionally running `vite dev` in a plain browser tab for
 * UI-only iteration. Distinguished by checking the Electron user agent:
 * if we're inside Electron's Chromium but window.flightsync is still
 * missing, the preload script threw and silently left us on mock data.
 */
export function isPreloadBroken() {
  const inElectron = navigator.userAgent.includes('Electron');
  return inElectron && !globalThis.__flightsyncPreloadOk;
}
