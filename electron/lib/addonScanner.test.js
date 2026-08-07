import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLibrary } from './addonScanner.js';

// Regression test built directly from a real user's actual library layout:
// a Community folder organized Addons-Linker style (category subfolders
// like "airliner", "livery"), where every individual addon folder is
// ALREADY a symlink pointing elsewhere (either from a previous FlightSync
// migration, or from Addons Linker itself, which works the same way).
// walkVault()'s recursion filter only checked entry.isDirectory(), which is
// false for a symlinked directory (Dirent reports the link's own type, not
// the target's) — so every addon under a category folder was silently
// invisible to the scanner. Confirmed against a real 100+ addon library
// that this produced a scan result of exactly zero addons.

let tmpRoot;
let communityPath;
let vaultPath;
let externalStorage;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-test-'));
  communityPath = path.join(tmpRoot, 'Community');
  vaultPath = path.join(tmpRoot, 'vault');
  externalStorage = path.join(tmpRoot, 'external-storage');
  await fs.mkdir(communityPath, { recursive: true });
  await fs.mkdir(vaultPath, { recursive: true });

  // The vault itself is organized Addons-Linker style: a category folder
  // containing addon folders that are symlinks to some other real storage
  // location (simulating either a prior migration, or Addons Linker's own
  // symlinks — same shape either way).
  const categoryDir = path.join(vaultPath, 'livery');
  await fs.mkdir(categoryDir, { recursive: true });

  const realAddonDir = path.join(externalStorage, 'some-real-livery');
  await fs.mkdir(realAddonDir, { recursive: true });
  await fs.writeFile(path.join(realAddonDir, 'manifest.json'), JSON.stringify({
    title: 'Some Real Livery', content_type: 'LIVERY',
  }));

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(realAddonDir, path.join(categoryDir, 'some-real-livery'), linkType);
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('scanLibrary — symlinked addons inside category folders', () => {
  it('finds an addon that is a symlink nested inside a real category folder', async () => {
    const { addons, warnings } = await scanLibrary(communityPath, vaultPath);
    expect(addons.map(a => a.folderName)).toContain('some-real-livery');
    expect(warnings.filter(w => w.code === 'no-manifest')).toEqual([]);
  });
});
