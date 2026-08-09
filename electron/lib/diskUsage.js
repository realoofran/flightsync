// electron/lib/diskUsage.js
//
// On-demand disk usage for the vault — deliberately NOT computed during a
// normal scan. Summing file sizes means statting every file in every addon,
// which is fine for a handful of small liveries but can take real time
// across a library with multi-gigabyte photogrammetry sceneries; folding it
// into scanLibrary would slow down the one operation every user runs most
// often. Instead this is a separate, explicitly-triggered pass (Library's
// "Show disk usage" button) so scanning itself never regresses.

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Recursive size of a real directory, in bytes. Symlinks/junctions found
 * INSIDE the tree are skipped rather than followed — addon folders here are
 * vault-side real directories, not links themselves, so this should rarely
 * matter, but following a link could double-count shared storage or hang on
 * a cyclical junction; skipping is the safe default for a "how much space
 * does this take" figure anyway (a link isn't its own storage).
 */
export async function folderSize(dirPath) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0; // unreadable/gone — contributes nothing rather than failing the whole total
  }

  let total = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await folderSize(entryPath);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(entryPath);
        total += stat.size;
      } catch {
        // File vanished between readdir and stat — skip it.
      }
    }
  }
  return total;
}

/**
 * @param {{id: string, absolutePath: string}[]} addons
 * @returns {Promise<Record<string, number>>} addon id -> size in bytes
 */
export async function computeAddonSizes(addons) {
  const sizes = {};
  for (const addon of addons) {
    sizes[addon.id] = await folderSize(addon.absolutePath);
  }
  return sizes;
}
