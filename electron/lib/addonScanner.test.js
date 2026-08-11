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

// Regression test built from a real user's actual Community folder: after
// reorganizing their external mod library (renaming/moving folders on a
// separate drive), several Community-folder junctions were left pointing at
// paths that no longer existed. These previously surfaced as a bare
// "ENOENT" read-error with no indication of the actual cause.
describe('scanLibrary — dangling junction in Community', () => {
  let tmpRoot, communityPath, vaultPath;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-brokenlink-test-'));
    communityPath = path.join(tmpRoot, 'Community');
    vaultPath = path.join(tmpRoot, 'vault');
    await fs.mkdir(communityPath, { recursive: true });

    const deadTarget = path.join(tmpRoot, 'external-drive', 'renamed-away');
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    // The target is never created — simulates the real scenario: the addon
    // folder was moved/renamed/deleted outside FlightSync after the link
    // was made, so the junction now points at nothing.
    await fs.symlink(deadTarget, path.join(communityPath, 'old-renamed-addon'), linkType);
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('reports it as a broken-link warning naming the dead target, not a bare ENOENT', async () => {
    const { addons, warnings } = await scanLibrary(communityPath, vaultPath);
    expect(addons).toEqual([]);
    const brokenLinkWarnings = warnings.filter(w => w.code === 'broken-link');
    expect(brokenLinkWarnings).toHaveLength(1);
    expect(brokenLinkWarnings[0].message).toMatch(/renamed-away/);
    expect(warnings.some(w => w.code === 'read-error')).toBe(false);
  });
});

// A real user, mid-session, described the default vault folder as unclear
// enough that "a normal user would just delete that and lose all their
// addons" — this is the safety net: a README dropped inside the vault
// itself (so the warning travels with the folder, found even by someone
// just browsing in Explorer rather than reading the app).
describe('scanLibrary — vault folder safety net', () => {
  let tmpRoot, communityPath, vaultPath;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-vaultsafety-test-'));
    communityPath = path.join(tmpRoot, 'Community');
    vaultPath = path.join(tmpRoot, '.flightsync-vault');
    await fs.mkdir(communityPath, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('writes a DO-NOT-DELETE README into the vault on every scan', async () => {
    await scanLibrary(communityPath, vaultPath);
    const readmePath = path.join(vaultPath, 'README - DO NOT DELETE THIS FOLDER.txt');
    const contents = await fs.readFile(readmePath, 'utf-8');
    expect(contents).toMatch(/permanently delete/i);
  });
});

// Regression test: a folder whose entire subtree is dead (no manifest
// anywhere) used to get reported TWICE — once for the folder itself and
// once for its one dead child — double-counting the exact same issue and
// inflating the perceived number of problems.
// Regression coverage for the detection-accuracy improvements aimed at
// shrinking the manual "needs confirmation" queue: layout.json content
// paths as an ICAO signal, manifest.creator feeding the airline/aircraft
// matchers, and this user's own past manual corrections (learnedTokens)
// as a last-resort fallback when the heuristic itself finds nothing.
describe('scanLibrary — extra detection signals', () => {
  let tmpRoot, communityPath, vaultPath;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-signals-test-'));
    communityPath = path.join(tmpRoot, 'Community');
    vaultPath = path.join(tmpRoot, 'vault');
    await fs.mkdir(communityPath, { recursive: true });

    // A scenery addon whose folder name and manifest title are both too
    // generic to match on their own, but whose layout.json lists a bgl
    // path containing the real ICAO — should still auto-resolve.
    const layoutAddonDir = path.join(communityPath, 'generic-airport-enhancement-x');
    await fs.mkdir(layoutAddonDir, { recursive: true });
    await fs.writeFile(path.join(layoutAddonDir, 'manifest.json'), JSON.stringify({
      title: 'Airport Enhancement X', content_type: 'SCENERY',
    }));
    await fs.writeFile(path.join(layoutAddonDir, 'layout.json'), JSON.stringify({
      content: [{ path: 'scenery/world/scenery/APX0_EDDS.bgl', size: 1 }],
    }));

    // A livery whose folder name has nothing an airline pattern would
    // match, but manifest.creator names the airline.
    const creatorAddonDir = path.join(communityPath, 'repaint-project-final-v3');
    await fs.mkdir(creatorAddonDir, { recursive: true });
    await fs.writeFile(path.join(creatorAddonDir, 'manifest.json'), JSON.stringify({
      title: 'Repaint Project Final v3', content_type: 'LIVERY', creator: 'Lufthansa Virtual Repaint Team',
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('resolves an ICAO found only in layout.json content paths', async () => {
    const { addons } = await scanLibrary(communityPath, vaultPath);
    const addon = addons.find(a => a.folderName === 'generic-airport-enhancement-x');
    expect(addon.matchedIcao).toBe('EDDS');
    expect(addon.confirmed).toBe(true);
  });

  it('resolves an airline found only in manifest.creator', async () => {
    const { addons } = await scanLibrary(communityPath, vaultPath);
    const addon = addons.find(a => a.folderName === 'repaint-project-final-v3');
    expect(addon.matchedAirline).toBe('DLH');
  });
});

describe('scanLibrary — learned-token fallback', () => {
  let tmpRoot, communityPath, vaultPath;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-learned-test-'));
    communityPath = path.join(tmpRoot, 'Community');
    vaultPath = path.join(tmpRoot, 'vault');
    await fs.mkdir(communityPath, { recursive: true });

    // Deliberately no aircraft-type-shaped token (e.g. "a320") anywhere —
    // isolates the airline-learning fallback from deriveConfirmed's
    // separate aircraft-type requirement for LIVERY (matchedAirline itself
    // isn't required for a livery to count as "confirmed").
    const addonDir = path.join(communityPath, 'somestudio-mysteryairline-v2');
    await fs.mkdir(addonDir, { recursive: true });
    await fs.writeFile(path.join(addonDir, 'manifest.json'), JSON.stringify({
      title: 'MysteryAirline Repaint', content_type: 'LIVERY',
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('leaves the airline unresolved with no learned tokens', async () => {
    const { addons } = await scanLibrary(communityPath, vaultPath);
    expect(addons[0].matchedAirline).toBeNull();
    expect(addons[0].matchedAircraftType).toBeNull();
    expect(addons[0].confirmed).toBe(false);
  });

  it('resolves the airline via a previously-learned token when the heuristic finds nothing', async () => {
    const learnedTokens = { icao: {}, aircraftType: {}, airline: { mysteryairline: 'XYZ' } };
    const { addons } = await scanLibrary(communityPath, vaultPath, learnedTokens);
    expect(addons[0].matchedAirline).toBe('XYZ');
  });
});

describe('scanLibrary — no-manifest warning de-duplication', () => {
  let tmpRoot, communityPath, vaultPath;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-scanner-dedup-test-'));
    communityPath = path.join(tmpRoot, 'Community');
    vaultPath = path.join(tmpRoot, 'vault');
    // A single-child dead-end chain, e.g. mirroring a real
    // "pmdg-aircraft-77f_CVT_/SIMOBJECTS" data-only companion folder with
    // no manifest anywhere inside it.
    const deadChain = path.join(communityPath, 'pmdg-aircraft-77f_CVT_', 'SIMOBJECTS');
    await fs.mkdir(deadChain, { recursive: true });
    await fs.writeFile(path.join(deadChain, 'some-data-file.bin'), 'not an addon');
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('reports the dead subtree once, at its shallowest point, not once per depth', async () => {
    const { warnings } = await scanLibrary(communityPath, vaultPath);
    const noManifestWarnings = warnings.filter(w => w.code === 'no-manifest');
    expect(noManifestWarnings).toHaveLength(1);
    expect(noManifestWarnings[0].path).toMatch(/pmdg-aircraft-77f_CVT_$/);
  });
});
