// electron/lib/addonScanner.js
//
// Scans the user's REAL MSFS Community folder directly — there is only
// ever one Community folder, so that's the only thing the user has to
// point this app at. The first time an addon is found there as a genuine
// directory (not yet a FlightSync symlink), it gets silently migrated: moved
// once into a hidden "vault" folder (a sibling of Community, so the move is
// same-filesystem and effectively instant even for huge sceneries), and a
// symlink is left behind in its exact original spot so MSFS sees zero
// difference. From that point on the addon is managed like everything else
// — see symlinkManager.js for the actual link/unlink logic used for syncing.
//
// RECURSIVE SCAN: also walks into subfolders the same way — a directory
// counts as "an addon" the moment it contains a manifest.json (or a bare
// layout.json for older packages). Anything else is treated as a pure
// category folder and its name is carried forward as a hint for content-type
// and ICAO matching (covers users who've grouped things into subfolders
// directly inside Community, e.g. via Addons Linker).
//
// Any folder that can't be read (permissions, OneDrive placeholder files,
// Windows long-path issues, etc.) is recorded as a warning rather than
// silently dropped — returned alongside the addon list so the UI can show
// the user exactly what got skipped and why, instead of addons quietly
// vanishing from the scan with no explanation.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractIcaoCodes, resolveConfidentIcao } from './icaoDatabase.js';
import { regionForIcao } from './icaoRegions.js';

const MAX_SCAN_DEPTH = 10;

/**
 * @param {string} communityPath  the user's real, single MSFS Community folder
 * @param {string} vaultPath      hidden sibling folder FlightSync manages — created if missing
 * @returns {Promise<{addons: Addon[], warnings: {path: string, message: string}[]}>}
 */
export async function scanLibrary(communityPath, vaultPath) {
  await fs.mkdir(vaultPath, { recursive: true });

  const warnings = [];
  await migrateRealFolders(communityPath, vaultPath, [], 0, warnings);

  const addons = [];
  await walkVault(vaultPath, vaultPath, [], addons, 0, warnings);
  markNameConflicts(addons, warnings);
  return { addons, warnings };
}

// MSFS's Community folder can only hold one folder per name. Two addons
// living in different category subfolders (e.g. "Airports/EDDM" and
// "Backup/EDDM") would silently collide the moment both tried to link in —
// whichever synced second would clobber the first junction. Flag every addon
// in a colliding group so flightMatcher.js can exclude them from auto-sync
// instead of guessing which one the user meant.
function markNameConflicts(addons, warnings) {
  const byName = new Map();
  for (const addon of addons) {
    if (!byName.has(addon.folderName)) byName.set(addon.folderName, []);
    byName.get(addon.folderName).push(addon);
  }
  for (const [folderName, group] of byName) {
    if (group.length < 2) continue;
    for (const addon of group) addon.nameConflict = true;
    warnings.push({
      path: folderName,
      code: 'name-conflict',
      message: `"${folderName}" in ${group.map(a => a.categoryPath || '(root)').join(' and ')}`,
    });
  }
}

/**
 * @returns {Promise<boolean>} true if this folder (or something inside it)
 *   was recognized as an addon and migrated/already-managed. Used to detect
 *   "dead" subtrees — real folders with real content that never resolve to
 *   an addon anywhere inside them (see the dead-end check below).
 */
async function migrateRealFolders(dir, vaultPath, categoryChain, depth, warnings) {
  if (depth > MAX_SCAN_DEPTH) {
    warnings.push({ path: dir, code: 'depth-limit', message: `Nested more than ${MAX_SCAN_DEPTH} levels deep` });
    return false;
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    warnings.push({ path: dir, code: 'read-error', message: err.code ?? err.message });
    return false;
  }

  const isAddonRoot = entries.some(e => e.isFile() && (e.name === 'manifest.json' || e.name === 'layout.json'));

  if (isAddonRoot) {
    try {
      const stat = await fs.lstat(dir);
      if (!stat.isSymbolicLink()) {
        await migrateOneFolder(dir, vaultPath, warnings);
      }
    } catch (err) {
      warnings.push({ path: dir, code: 'migrate-error', message: err.code ?? err.message });
      return false;
    }
    return true; // never recurse into an addon's own internals
  }

  const subEntries = entries.filter(e => !e.name.startsWith('.') && (e.isDirectory() || e.isSymbolicLink()));
  let foundAny = false;
  for (const entry of subEntries) {
    // Symlinked category folders (unusual, but possible) still need
    // descending into — check isDirectory() OR isSymbolicLink() so we don't
    // silently stop at a link the way a naive isDirectory()-only check would
    // (Dirent reports the link's own type, not what it resolves to).
    const found = await migrateRealFolders(path.join(dir, entry.name), vaultPath, [...categoryChain, entry.name], depth + 1, warnings);
    foundAny = foundAny || found;
  }

  // Dead-end: this folder has real content but nothing anywhere inside it
  // was ever recognized as an addon (no manifest.json/layout.json in its
  // whole subtree) — e.g. a package shipped without a manifest, or a
  // broken/incomplete install. Previously this was silently invisible: the
  // folder just sat unmanaged in Community forever with zero indication
  // anything was wrong. Gated to depth <= 2 (Community/Addon or
  // Community/Category/Addon, the two real-world layouts) so a single dead
  // folder doesn't produce one warning per nested subfolder inside it.
  if (!foundAny && depth > 0 && depth <= 2 && (subEntries.length > 0 || entries.some(e => e.isFile()))) {
    warnings.push({ path: dir, code: 'no-manifest', message: 'No manifest.json/layout.json anywhere inside' });
  }

  return foundAny;
}

async function migrateOneFolder(realPath, vaultPath, warnings) {
  const folderName = path.basename(realPath);
  const vaultTarget = path.join(vaultPath, folderName);

  const alreadyInVault = await exists(vaultTarget);
  if (!alreadyInVault) {
    try {
      await fs.rename(realPath, vaultTarget);
    } catch (err) {
      if (err.code === 'EXDEV') {
        await fs.cp(realPath, vaultTarget, { recursive: true });
        await fs.rm(realPath, { recursive: true, force: true });
      } else {
        warnings.push({ path: realPath, code: 'migrate-error', message: err.code ?? err.message });
        return;
      }
    }
  } else {
    await fs.rm(realPath, { recursive: true, force: true });
  }

  await fs.symlink(vaultTarget, realPath, process.platform === 'win32' ? 'junction' : 'dir');
}

async function walkVault(absoluteDir, vaultRoot, categoryChain, results, depth, warnings) {
  if (depth > MAX_SCAN_DEPTH) {
    warnings.push({ path: absoluteDir, code: 'depth-limit', message: `Nested more than ${MAX_SCAN_DEPTH} levels deep` });
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    warnings.push({ path: absoluteDir, code: 'read-error', message: err.code ?? err.message });
    return;
  }

  const isAddonRoot = entries.some(e => e.isFile() && (e.name === 'manifest.json' || e.name === 'layout.json'));

  if (isAddonRoot) {
    const folderName = path.basename(absoluteDir);
    try {
      const addon = await scanOneAddon(absoluteDir, folderName, categoryChain);
      if (addon) results.push(addon);
    } catch (err) {
      warnings.push({ path: absoluteDir, code: 'read-error', message: err.code ?? err.message });
    }
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    // Symlinked category/addon folders must still be descended into — check
    // isDirectory() OR isSymbolicLink() so we don't silently stop at a link
    // the way a naive isDirectory()-only check would (Dirent reports the
    // link's own type, not what it resolves to). Confirmed as a real bug
    // against a real library: every addon under an Addons-Linker-style
    // category folder was already a symlink (from a prior migration/Addons
    // Linker itself), and this check alone caused a scan to silently find
    // zero addons despite the library having hundreds.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    await walkVault(path.join(absoluteDir, entry.name), vaultRoot, [...categoryChain, entry.name], results, depth + 1, warnings);
  }
}

async function scanOneAddon(absolutePath, folderName, categoryChain) {
  const manifestPath = path.join(absolutePath, 'manifest.json');
  let manifest = null;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    // Some community addons (esp. older liveries) ship without a manifest —
    // still listed, just with lower-confidence matching.
  }

  const title = manifest?.title ?? folderName;
  const categoryHintText = categoryChain.join(' ');
  let contentType = normalizeContentType(manifest?.content_type, categoryHintText);

  // Older/simpler addons often ship without a manifest content_type at all
  // and sit directly in Community with no category folder hint either — the
  // exact case that used to fall through to "OTHER" and never even attempt
  // ICAO matching, despite the folder name being obviously an airport code
  // ("KJFK-NewYork"). If nothing else identified a type but the folder name
  // itself starts with something ICAO-shaped, give scenery matching a shot
  // rather than giving up before trying.
  if (contentType === 'OTHER' && /^[A-Z]{4}\b/i.test(folderName)) {
    contentType = 'SCENERY';
  }

  const combinedText = `${folderName} ${title} ${categoryHintText}`;

  const candidateIcaos = contentType === 'SCENERY'
    ? dedupe([
        ...extractIcaoCodes(folderName),
        ...extractIcaoCodes(title),
        ...extractIcaoCodes(categoryHintText),
      ])
    : [];

  // Confidence-scored resolution: even with multiple raw regex candidates,
  // auto-resolve when exactly one sits in a position a human would trust
  // instantly ("[EDDM]", "EDDM - Munich", name-corroborated, etc). Only
  // genuinely ambiguous cases fall through to the manual confirm queue.
  const matchedIcao = resolveConfidentIcao(combinedText, candidateIcaos);

  const matchedAircraftType = contentType === 'LIVERY' || contentType === 'AIRCRAFT'
    ? guessAircraftType(combinedText)
    : null;

  const matchedAirline = contentType === 'LIVERY'
    ? guessAirlineCode(combinedText)
    : null;

  return {
    id: hashPath(absolutePath),
    folderName,
    absolutePath,
    categoryPath: categoryChain.slice(0, -1).join('/'),
    title,
    contentType,
    region: contentType === 'SCENERY' && matchedIcao ? regionForIcao(matchedIcao) : null,
    candidateIcaos,
    matchedIcao,
    matchedAircraftType,
    matchedAirline,
    confirmed: contentType === 'SCENERY'
      ? Boolean(matchedIcao)
      : Boolean(matchedAircraftType),
    alwaysActive: false,
    nameConflict: false,
    manifestHash: manifest ? hashContent(JSON.stringify(manifest)) : hashContent(folderName),
  };
}

const CATEGORY_HINTS = [
  ['SCENERY', /\b(airports?|scenery|sceneries)\b/i],
  ['LIVERY', /\b(airlines?|liver(y|ies)|repaints?|paints?)\b/i],
  ['AIRCRAFT', /\b(aircraft|planes?|hangar|airliners?|gliders?|gliding|traffic)\b/i],
];

function normalizeContentType(raw, categoryHintText) {
  const v = raw ? String(raw).toUpperCase() : '';
  if (v.includes('SCENERY') || v.includes('AIRPORT')) return 'SCENERY';
  if (v.includes('LIVERY')) return 'LIVERY';
  if (v.includes('SIMOBJECT') || v.includes('AIRCRAFT')) return 'AIRCRAFT';

  for (const [type, pattern] of CATEGORY_HINTS) {
    if (pattern.test(categoryHintText)) return type;
  }
  return 'OTHER';
}

// Aircraft ICAO type codes — both descriptive-name patterns AND the bare
// ICAO type code itself (most liveries have the literal type code
// somewhere in the folder name, e.g. "A21N", "B738" — checking for that
// directly, not just the spelled-out name, is what catches most of them
// without needing manual confirmation).
const AIRCRAFT_TYPE_PATTERNS = [
  ['A21N', /\ba32[01]neo\b|\ba21n\b/i],
  ['A20N', /\ba320neo\b|\ba20n\b/i],
  ['A319', /\ba319\b/i],
  ['A320', /\ba320(?!neo)\b/i],
  ['A321', /\ba321(?!neo)\b/i],
  ['A339', /\ba330-?900\b|\ba339\b/i],
  ['A332', /\ba330-?200\b|\ba332\b/i],
  ['A359', /\ba350-?900\b|\ba359\b/i],
  ['A388', /\ba380\b|\ba388\b/i],
  ['B38M', /\b737\s?max\s?8\b|\bb38m\b/i],
  ['B738', /\b738\b|\b737-?800\b/i],
  ['B739', /\b739\b|\b737-?900\b/i],
  ['B744', /\b747-?400\b|\bb744\b/i],
  ['B752', /\b757-?200\b|\bb752\b/i],
  ['B763', /\b767-?300\b|\bb763\b/i],
  ['B772', /\b777-?200\b|\bb772\b/i],
  ['B77W', /\b777-?300er\b|\b77w\b/i],
  ['B788', /\b787-?8\b|\bb788\b/i],
  ['B789', /\b787-?9\b|\b789\b/i],
  ['CRJ9', /\bcrj-?900\b|\bcrj9\b/i],
  ['E190', /\be-?190\b|\be190\b/i],
  ['E175', /\be-?175\b|\be175\b/i],
  ['DR40', /\bdr[- ]?400\b/i],
  ['C172', /\bc172\b|\bcessna\s?172\b/i],
  ['PA28', /\bpa-?28\b|\bpiper\s?(archer|cherokee)\b/i],
  ['TBM9', /\btbm\s?9(00|30)\b/i],
];

function guessAircraftType(text) {
  for (const [code, pattern] of AIRCRAFT_TYPE_PATTERNS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

// Airline ICAO codes — extended list covering the majors most liveries in
// the wild are actually for, beyond the original TRvACC-relevant seed set.
const AIRLINE_PATTERNS = [
  ['THY', /\bturkish\s*airlines?\b|\bthy\b/i],
  ['PGT', /\bpegasus\b/i],
  ['DLH', /\blufthansa\b|\bdlh\b/i],
  ['CFG', /\bcondor\b/i],
  ['UAE', /\bemirates\b/i],
  ['QTR', /\bqatar\s*airways?\b/i],
  ['BAW', /\bbritish\s*airways?\b|\bbaw\b/i],
  ['AFR', /\bair\s*france\b/i],
  ['UAL', /\bunited\b/i],
  ['DAL', /\bdelta\b/i],
  ['RYR', /\bryanair\b/i],
  ['EZY', /\beasyjet\b/i],
  ['KLM', /\bklm\b/i],
  ['IBE', /\biberia\b/i],
  ['SWR', /\bswiss\b/i],
  ['AUA', /\baustrian\s*airlines?\b/i],
  ['WZZ', /\bwizz\s?air\b/i],
  ['VLG', /\bvueling\b/i],
  ['NAX', /\bnorwegian\b/i],
  ['SAS', /\bscandinavian\b|\bsas\b/i],
  ['FIN', /\bfinnair\b/i],
  ['AFL', /\baeroflot\b/i],
  ['AAL', /\bamerican\s*airlines?\b|\baal\b/i],
  ['SWA', /\bsouthwest\b/i],
  ['JBU', /\bjetblue\b/i],
  ['ASA', /\balaska\s*airlines?\b/i],
  ['ACA', /\bair\s*canada\b/i],
  ['CPA', /\bcathay\s*pacific\b/i],
  ['ANA', /\ball\s*nippon\b|\bana\b/i],
  ['JAL', /\bjapan\s*airlines?\b|\bjal\b/i],
  ['SIA', /\bsingapore\s*airlines?\b/i],
  ['QFA', /\bqantas\b/i],
  ['ETD', /\betihad\b/i],
  ['SVA', /\bsaudia\b/i],
];

function guessAirlineCode(text) {
  for (const [code, pattern] of AIRLINE_PATTERNS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

function dedupe(arr) {
  return [...new Set(arr)];
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function hashPath(p) {
  return crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
}

function hashContent(c) {
  return crypto.createHash('sha1').update(c).digest('hex').slice(0, 16);
}
