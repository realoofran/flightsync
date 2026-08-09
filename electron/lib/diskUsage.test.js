import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { folderSize, computeAddonSizes } from './diskUsage.js';

let tmpRoot;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flightsync-disksize-test-'));

  // addon-a: two files, one nested subfolder with a third file.
  await fs.mkdir(path.join(tmpRoot, 'addon-a', 'texture'), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, 'addon-a', 'manifest.json'), 'x'.repeat(100));
  await fs.writeFile(path.join(tmpRoot, 'addon-a', 'model.glb'), 'x'.repeat(2000));
  await fs.writeFile(path.join(tmpRoot, 'addon-a', 'texture', 'diffuse.png'), 'x'.repeat(500));

  // addon-b: empty folder.
  await fs.mkdir(path.join(tmpRoot, 'addon-b'), { recursive: true });

  // A dangling symlink inside addon-a's tree should be skipped, not followed/thrown on.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(path.join(tmpRoot, 'nonexistent-target'), path.join(tmpRoot, 'addon-a', 'broken-link'), linkType).catch(() => {});
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('folderSize', () => {
  it('sums file sizes recursively across nested subfolders', async () => {
    const size = await folderSize(path.join(tmpRoot, 'addon-a'));
    expect(size).toBe(100 + 2000 + 500);
  });

  it('returns 0 for an empty folder', async () => {
    expect(await folderSize(path.join(tmpRoot, 'addon-b'))).toBe(0);
  });

  it('returns 0 for a folder that does not exist, instead of throwing', async () => {
    expect(await folderSize(path.join(tmpRoot, 'does-not-exist'))).toBe(0);
  });
});

describe('computeAddonSizes', () => {
  it('maps each addon id to its own folder size', async () => {
    const sizes = await computeAddonSizes([
      { id: 'a', absolutePath: path.join(tmpRoot, 'addon-a') },
      { id: 'b', absolutePath: path.join(tmpRoot, 'addon-b') },
    ]);
    expect(sizes).toEqual({ a: 2600, b: 0 });
  });
});
