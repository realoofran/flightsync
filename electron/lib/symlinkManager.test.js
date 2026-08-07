import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { computeSyncPlan, applySyncPlan } from './symlinkManager.js';

// computeSyncPlan/applySyncPlan are the only code in the app that writes into
// the real Community folder, so this exercises them against real
// directories/junctions on disk rather than mocking fs — the same way
// PLAN.md describes the manual verification that was previously done by
// hand for every release.

let tmpRoot;
let communityPath;
let vaultAddonsPath;

const addonRequired = mkAddon('required-scenery');
const addonAlreadyLinked = mkAddon('already-linked-scenery');
const addonToUnlink = mkAddon('stale-scenery');
const addonAlwaysActive = mkAddon('always-active-util');

function mkAddon(folderName) {
  return { id: folderName, folderName, absolutePath: null, alwaysActive: false };
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-test-'));
  communityPath = path.join(tmpRoot, 'Community');
  vaultAddonsPath = path.join(tmpRoot, 'vault');
  await fs.mkdir(communityPath, { recursive: true });
  await fs.mkdir(vaultAddonsPath, { recursive: true });

  for (const addon of [addonRequired, addonAlreadyLinked, addonToUnlink, addonAlwaysActive]) {
    addon.absolutePath = path.join(vaultAddonsPath, addon.folderName);
    await fs.mkdir(addon.absolutePath, { recursive: true });
  }
  addonAlwaysActive.alwaysActive = true;

  // Pre-link the addons that should already be present in Community before
  // the plan is computed, so computeSyncPlan sees real on-disk state.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  for (const addon of [addonAlreadyLinked, addonToUnlink, addonAlwaysActive]) {
    await fs.symlink(addon.absolutePath, path.join(communityPath, addon.folderName), linkType);
  }
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('computeSyncPlan + applySyncPlan (real filesystem)', () => {
  it('computes link/unlink/unchanged correctly against real symlinks', async () => {
    const allManagedAddons = [addonRequired, addonAlreadyLinked, addonToUnlink, addonAlwaysActive];
    const requiredAddons = [addonRequired, addonAlreadyLinked];

    const plan = await computeSyncPlan(communityPath, requiredAddons, allManagedAddons);

    expect(plan.toLink.map(a => a.id)).toEqual([addonRequired.id]);
    expect(plan.toUnlink.map(a => a.id)).toEqual([addonToUnlink.id]);
    expect(plan.unchanged.map(a => a.id).sort()).toEqual(
      [addonAlreadyLinked.id, addonAlwaysActive.id].sort()
    );
  });

  it('applies the plan: creates the missing link, removes the stale one, leaves the rest', async () => {
    const allManagedAddons = [addonRequired, addonAlreadyLinked, addonToUnlink, addonAlwaysActive];
    const requiredAddons = [addonRequired, addonAlreadyLinked];
    const plan = await computeSyncPlan(communityPath, requiredAddons, allManagedAddons);

    const result = await applySyncPlan(communityPath, plan);
    expect(result.errors).toEqual([]);
    expect(result.linked).toEqual([addonRequired.id]);
    expect(result.unlinked).toEqual([addonToUnlink.id]);

    const afterEntries = await fs.readdir(communityPath);
    expect(afterEntries.sort()).toEqual(
      [addonRequired.folderName, addonAlreadyLinked.folderName, addonAlwaysActive.folderName].sort()
    );
  });

  it('refuses to overwrite a real (non-symlink) folder with the same name', async () => {
    const realFolderAddon = mkAddon('collides-with-real-folder');
    realFolderAddon.absolutePath = path.join(vaultAddonsPath, realFolderAddon.folderName);
    await fs.mkdir(realFolderAddon.absolutePath, { recursive: true });
    // Simulate a real, non-FlightSync folder already sitting in Community.
    await fs.mkdir(path.join(communityPath, realFolderAddon.folderName), { recursive: true });

    const plan = { toLink: [realFolderAddon], toUnlink: [], unchanged: [] };
    const result = await applySyncPlan(communityPath, plan);

    expect(result.linked).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe(realFolderAddon.id);
  });
});
