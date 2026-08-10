import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initDb, upsertScannedAddons, applyAiClassifications, createLoadout, deleteLoadout, getDb } from './db.js';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-db-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('initDb — settings migration', () => {
  it('backfills settings fields added after a db.json was first written, without touching existing values', async () => {
    // Simulates a real pre-v1.0.0 db.json on disk: predates aiApiKey,
    // minimizeToTray, notifyOnMsfsLaunch, autoSyncOnLaunch, and
    // onboardingComplete entirely — confirmed against the user's actual
    // %APPDATA%\FlightSync\flightsync-db.json, which was missing exactly
    // these fields and silently reading as undefined everywhere they were
    // used.
    const file = path.join(tmpDir, 'flightsync-db.json');
    await fs.writeFile(file, JSON.stringify({
      settings: {
        communityPath: 'D:\\MSFS\\Community',
        vaultPath: 'D:\\MSFS\\.flightsync-vault',
        simbriefPilotId: '12345',
        includeAlternates: false,
        theme: 'light',
        language: 'de',
      },
      addons: {},
      syncHistory: [],
    }));

    const db = await initDb(tmpDir);

    // New fields backfilled from DEFAULT_DATA.
    expect(db.data.settings.aiApiKey).toBeNull();
    expect(db.data.settings.minimizeToTray).toBe(false);
    expect(db.data.settings.notifyOnMsfsLaunch).toBe(true);
    expect(db.data.settings.autoSyncOnLaunch).toBe(false);
    expect(db.data.settings.vatsimCid).toBeNull();
    expect(db.data.settings.soundEnabled).toBe(false);
    expect(db.data.flightLog).toEqual([]);

    // Existing values on disk are never overwritten by the backfill.
    expect(db.data.settings.communityPath).toBe('D:\\MSFS\\Community');
    expect(db.data.settings.includeAlternates).toBe(false);
    expect(db.data.settings.theme).toBe('light');
    expect(db.data.settings.language).toBe('de');

    // Special-cased migration: a pre-existing communityPath means this user
    // was already using the app before onboardingComplete existed, so they
    // must NOT be sent back through the first-run wizard.
    expect(db.data.settings.onboardingComplete).toBe(true);
  });

  it('leaves onboardingComplete false for a genuinely fresh install with no communityPath', async () => {
    const db = await initDb(tmpDir);
    expect(db.data.settings.onboardingComplete).toBe(false);
  });
});

function scannedAddon(overrides) {
  return {
    id: 'a1',
    folderName: 'test-addon',
    absolutePath: '/vault/test-addon',
    title: 'Test Addon',
    contentType: 'SCENERY',
    candidateIcaos: ['EDDM'],
    matchedIcao: null,
    matchedAircraftType: null,
    matchedAirline: null,
    confirmed: false,
    alwaysActive: false,
    nameConflict: false,
    manifestHash: 'hash-1',
    ...overrides,
  };
}

describe('upsertScannedAddons — rescan behavior', () => {
  beforeEach(async () => { await initDb(tmpDir); });

  it('overwrites an unconfirmed addon on rescan even when the manifest hash is unchanged', async () => {
    // Regression: a prior version skipped reprocessing whenever the file
    // hash matched, regardless of confirmed status — meaning a matching
    // algorithm improvement (e.g. a new false-positive word) would never
    // actually apply to anything already scanned, since Rescan would just
    // restore the exact same stale unconfirmed guess forever.
    await upsertScannedAddons([scannedAddon({ matchedIcao: null, confirmed: false })]);
    expect(getDb().data.addons.a1.matchedIcao).toBeNull();

    // Same file on disk (same manifestHash), but the algorithm now resolves it.
    await upsertScannedAddons([scannedAddon({ matchedIcao: 'EDDM', confirmed: true })]);
    expect(getDb().data.addons.a1.matchedIcao).toBe('EDDM');
    expect(getDb().data.addons.a1.confirmed).toBe(true);
  });

  it('preserves a confirmed addon on rescan when the manifest hash is unchanged', async () => {
    await upsertScannedAddons([scannedAddon({ matchedIcao: 'EDDF', confirmed: true })]);
    // User manually overrode the match after the scan.
    getDb().data.addons.a1.matchedIcao = 'EDDL';
    await getDb().write();

    // Rescan with the same file (same hash) and a scanner guess that would
    // disagree with the user's override — the override must win.
    await upsertScannedAddons([scannedAddon({ matchedIcao: 'EDDF', confirmed: true })]);
    expect(getDb().data.addons.a1.matchedIcao).toBe('EDDL');
  });

  it('resets confirmation when a confirmed addon file actually changes', async () => {
    await upsertScannedAddons([scannedAddon({ matchedIcao: 'EDDF', confirmed: true, alwaysActive: true })]);
    await upsertScannedAddons([scannedAddon({ matchedIcao: 'EDDM', confirmed: true, manifestHash: 'hash-2' })]);
    expect(getDb().data.addons.a1.matchedIcao).toBe('EDDM');
    // alwaysActive is a user preference independent of the file — kept.
    expect(getDb().data.addons.a1.alwaysActive).toBe(true);
  });

  it('prunes addons no longer present in the latest scan', async () => {
    await upsertScannedAddons([scannedAddon({ id: 'a1' }), scannedAddon({ id: 'a2' })]);
    await upsertScannedAddons([scannedAddon({ id: 'a1' })]);
    expect(Object.keys(getDb().data.addons)).toEqual(['a1']);
  });
});

describe('applyAiClassifications', () => {
  beforeEach(async () => { await initDb(tmpDir); });

  it('auto-confirms a high-confidence, fully-resolved suggestion', async () => {
    await upsertScannedAddons([scannedAddon({ contentType: 'OTHER', confirmed: false })]);
    const applied = await applyAiClassifications([
      { id: 'a1', contentType: 'SCENERY', matchedIcao: 'EDDM', matchedAircraftType: null, matchedAirline: null, confidence: 'high' },
    ]);
    expect(applied).toBe(1);
    expect(getDb().data.addons.a1.contentType).toBe('SCENERY');
    expect(getDb().data.addons.a1.matchedIcao).toBe('EDDM');
    expect(getDb().data.addons.a1.confirmed).toBe(true);
    expect(getDb().data.addons.a1.aiClassified).toBe(true);
  });

  it('leaves a low-confidence suggestion in the unconfirmed queue, pre-filled', async () => {
    await upsertScannedAddons([scannedAddon({ contentType: 'OTHER', confirmed: false })]);
    await applyAiClassifications([
      { id: 'a1', contentType: 'SCENERY', matchedIcao: 'EDDM', matchedAircraftType: null, matchedAirline: null, confidence: 'low' },
    ]);
    expect(getDb().data.addons.a1.matchedIcao).toBe('EDDM');
    expect(getDb().data.addons.a1.confirmed).toBe(false);
  });

  it('forces alwaysActive when auto-confirming an OTHER classification, matching confirmAddonMatch', async () => {
    await upsertScannedAddons([scannedAddon({ contentType: 'SCENERY', matchedIcao: null, confirmed: false, alwaysActive: false })]);
    await applyAiClassifications([
      { id: 'a1', contentType: 'OTHER', matchedIcao: null, matchedAircraftType: null, matchedAirline: null, confidence: 'high' },
    ]);
    expect(getDb().data.addons.a1.confirmed).toBe(true);
    expect(getDb().data.addons.a1.alwaysActive).toBe(true);
  });

  it('ignores updates for addon ids no longer in the library', async () => {
    await upsertScannedAddons([scannedAddon({ id: 'a1' })]);
    const applied = await applyAiClassifications([
      { id: 'ghost', contentType: 'SCENERY', matchedIcao: 'EDDM', confidence: 'high' },
    ]);
    expect(applied).toBe(0);
  });
});

describe('createLoadout / deleteLoadout', () => {
  beforeEach(async () => { await initDb(tmpDir); });

  it('creates a loadout with a trimmed name and de-duplicated addon ids', async () => {
    const loadout = await createLoadout('  Winter Ops A320  ', ['a1', 'a2', 'a1']);
    expect(loadout.name).toBe('Winter Ops A320');
    expect(loadout.addonIds).toEqual(['a1', 'a2']);
    expect(loadout.id).toBeTruthy();
    expect(loadout.createdAt).toBeTruthy();
    expect(getDb().data.loadouts).toHaveLength(1);
  });

  it('rejects an empty or whitespace-only name', async () => {
    await expect(createLoadout('', ['a1'])).rejects.toThrow('name cannot be empty');
    await expect(createLoadout('   ', ['a1'])).rejects.toThrow('name cannot be empty');
    expect(getDb().data.loadouts).toHaveLength(0);
  });

  it('rejects a loadout with no addons', async () => {
    await expect(createLoadout('Empty', [])).rejects.toThrow('at least one addon');
    await expect(createLoadout('Empty', undefined)).rejects.toThrow('at least one addon');
  });

  it('deletes a loadout by id, leaving others untouched', async () => {
    const a = await createLoadout('A', ['a1']);
    const b = await createLoadout('B', ['a2']);
    await deleteLoadout(a.id);
    expect(getDb().data.loadouts.map(l => l.id)).toEqual([b.id]);
  });

  it('is a silent no-op when deleting an id that does not exist', async () => {
    await createLoadout('A', ['a1']);
    await expect(deleteLoadout('nonexistent')).resolves.not.toThrow();
    expect(getDb().data.loadouts).toHaveLength(1);
  });
});
