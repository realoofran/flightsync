import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initDb, upsertScannedAddons, applyAiClassifications, getDb } from './db.js';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-db-test-'));
  await initDb(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
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
