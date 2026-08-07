// electron/lib/symlinkManager.js
//
// This is the only module allowed to write into the live MSFS Community
// folder. Everything else in the app only ever reads/writes the separate
// "library" folder and the local database.
//
// Windows note: we use directory JUNCTIONS (fs.symlink(..., 'junction')),
// not symbolic links. Junctions don't require Administrator privileges,
// unlike Windows symlinks, which is the whole reason this works without an
// elevation prompt. On macOS/Linux (for X-Plane-adjacent future support, or
// devs testing off a Mac) we fall back to a plain symlink.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LINK_TYPE = os.platform() === 'win32' ? 'junction' : 'dir';

/**
 * @typedef {Object} SyncPlan
 * @property {Addon[]} toLink     addons that need a new symlink created
 * @property {Addon[]} toUnlink   addons whose symlink should be removed
 * @property {Addon[]} unchanged  addons already in the correct state
 */

/**
 * Compares the set of addons required for the current flight against what's
 * currently linked in Community, without changing anything. The UI shows
 * this plan to the user before `applySyncPlan` is called.
 *
 * @param {string} communityPath
 * @param {Addon[]} requiredAddons     addons the current route/aircraft needs
 * @param {Addon[]} allManagedAddons   every addon FlightSync knows about (so it
 *                                     knows what it's allowed to unlink — it
 *                                     must never touch a folder it didn't create)
 * @returns {Promise<SyncPlan>}
 */
export async function computeSyncPlan(communityPath, requiredAddons, allManagedAddons) {
  const currentlyLinked = await getManagedLinks(communityPath, allManagedAddons);
  const requiredIds = new Set(requiredAddons.map(a => a.id));
  const alwaysActiveIds = new Set(allManagedAddons.filter(a => a.alwaysActive).map(a => a.id));

  const toLink = requiredAddons.filter(a => !currentlyLinked.has(a.id));

  const toUnlink = allManagedAddons.filter(a =>
    currentlyLinked.has(a.id) &&
    !requiredIds.has(a.id) &&
    !alwaysActiveIds.has(a.id)
  );

  const unchanged = allManagedAddons.filter(a =>
    currentlyLinked.has(a.id) && (requiredIds.has(a.id) || alwaysActiveIds.has(a.id))
  );

  return { toLink, toUnlink, unchanged };
}

/**
 * Executes a previously computed SyncPlan. Idempotent — safe to re-run if
 * a previous run was interrupted (e.g. app crash mid-sync).
 *
 * @param {string} communityPath
 * @param {SyncPlan} plan
 * @returns {Promise<{linked: string[], unlinked: string[], errors: {id: string, message: string}[]}>}
 */
export async function applySyncPlan(communityPath, plan) {
  const linked = [];
  const unlinked = [];
  const errors = [];

  for (const addon of plan.toUnlink) {
    try {
      await removeLink(communityPath, addon);
      unlinked.push(addon.id);
    } catch (err) {
      errors.push({ id: addon.id, message: err.message });
    }
  }

  for (const addon of plan.toLink) {
    try {
      await createLink(communityPath, addon);
      linked.push(addon.id);
    } catch (err) {
      errors.push({ id: addon.id, message: err.message });
    }
  }

  return { linked, unlinked, errors };
}

async function createLink(communityPath, addon) {
  const target = path.join(communityPath, addon.folderName);

  // Guard against clobbering something that isn't ours (e.g. the user
  // manually installed an addon with the same folder name directly into
  // Community — never overwrite a real directory).
  const existing = await lstatSafe(target);
  if (existing && !existing.isSymbolicLink()) {
    throw new Error(
      `"${addon.folderName}" already exists in Community as a real folder, not a FlightSync link — skipped to avoid data loss.`
    );
  }
  if (existing) {
    // Already a link (possibly stale/broken) — remove and relink cleanly.
    await fs.unlink(target);
  }

  await fs.symlink(addon.absolutePath, target, LINK_TYPE);
}

async function removeLink(communityPath, addon) {
  const target = path.join(communityPath, addon.folderName);
  const existing = await lstatSafe(target);
  if (!existing) return; // already gone, nothing to do
  if (!existing.isSymbolicLink()) {
    // Never delete a real folder, only ever a link we control.
    throw new Error(
      `"${addon.folderName}" in Community is a real folder, not a FlightSync link — left untouched.`
    );
  }
  await fs.unlink(target);
}

/**
 * Reads the Community folder and returns the subset of `knownAddons` that
 * are currently present there as a symlink pointing back into the library.
 * @returns {Promise<Set<string>>} set of addon ids
 */
async function getManagedLinks(communityPath, knownAddons) {
  const byFolderName = new Map(knownAddons.map(a => [a.folderName, a]));
  const linkedIds = new Set();

  const entries = await fs.readdir(communityPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const addon = byFolderName.get(entry.name);
    if (!addon) continue; // symlink FlightSync doesn't recognize — leave alone

    const target = path.join(communityPath, entry.name);
    const resolved = await fs.readlink(target).catch(() => null);
    if (resolved && path.resolve(path.dirname(target), resolved) === path.resolve(addon.absolutePath)) {
      linkedIds.add(addon.id);
    }
  }

  return linkedIds;
}

async function lstatSafe(p) {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}
