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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractIcaoCodes, resolveConfidentIcao } from './icaoDatabase.js';
import { regionForIcao } from './icaoRegions.js';
import { CONTENT_TYPES } from './contentTypes.js';
import { lookupLearnedValue } from './learnedPatterns.js';

const execFileAsync = promisify(execFile);
const MAX_SCAN_DEPTH = 10;
// Threaded through from db.data.learnedTokens (see learnedPatterns.js) by
// every real caller; only ever falls back to this empty default in tests
// that call scanLibrary()/scanOneAddon() directly without a DB behind them.
const EMPTY_LEARNED_TOKENS = { icao: {}, aircraftType: {}, airline: {} };
const VAULT_README_NAME = 'README - DO NOT DELETE THIS FOLDER.txt';
const VAULT_README_TEXT = `This folder holds the REAL files for every addon FlightSync manages.

The copies you see in your MSFS Community folder are just links pointing
back here. There is no other copy anywhere else — deleting or moving this
folder permanently deletes those addons from Microsoft Flight Simulator.

If you want to stop FlightSync managing a specific addon, do it from
within FlightSync (or move that one addon's folder back into Community by
hand) — don't touch this folder directly unless you mean to.

Safe to otherwise ignore. FlightSync manages everything in here on its own.
`;

/**
 * @param {string} communityPath  the user's real, single MSFS Community folder
 * @param {string} vaultPath      hidden sibling folder FlightSync manages — created if missing
 * @param {{icao: Record<string,string>, aircraftType: Record<string,string>, airline: Record<string,string>}} [learnedTokens]
 *   this user's own past manual corrections (db.data.learnedTokens) — consulted as a last-resort
 *   fallback whenever the heuristic itself can't resolve a field, see learnedPatterns.js
 * @returns {Promise<{addons: Addon[], warnings: {path: string, message: string}[]}>}
 */
export async function scanLibrary(communityPath, vaultPath, learnedTokens = EMPTY_LEARNED_TOKENS) {
  await fs.mkdir(vaultPath, { recursive: true });
  await protectVaultFolder(vaultPath);

  const warnings = [];
  await migrateRealFolders(communityPath, vaultPath, [], 0, warnings);

  const addons = [];
  await walkVault(vaultPath, vaultPath, [], addons, 0, warnings, learnedTokens);
  markNameConflicts(addons, warnings);
  return { addons, warnings };
}

/**
 * Best-effort safety net so a normal user doesn't stumble on the vault and
 * delete it thinking it's disposable app clutter — confirmed real user
 * confusion, not a hypothetical. Two things: (1) a README dropped inside
 * the vault itself, so the warning travels with the folder even if it's
 * found by browsing rather than reading the app; (2) on Windows, mark it
 * Hidden — but ONLY when it's FlightSync's own auto-created default
 * location (named ".flightsync-vault"), never when the user has pointed
 * the vault at a folder they already own and browse directly (e.g. an
 * existing addon library on another drive) — hiding someone's own folder
 * out from under them would be far more surprising than helpful.
 */
async function protectVaultFolder(vaultPath) {
  try {
    await fs.writeFile(path.join(vaultPath, VAULT_README_NAME), VAULT_README_TEXT);
  } catch {
    // Non-critical — never let a README write failure break scanning.
  }

  if (process.platform === 'win32' && path.basename(vaultPath) === '.flightsync-vault') {
    try {
      await execFileAsync('attrib', ['+h', vaultPath]);
    } catch {
      // Non-critical — hiding the folder is a nice-to-have, not required.
    }
  }
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
 * @returns {Promise<{foundAny: boolean, noManifestWarnings: object[]}>}
 *   foundAny: true if this folder (or something inside it) was recognized
 *   as an addon and migrated/already-managed — used to detect "dead"
 *   subtrees (see the dead-end check below). noManifestWarnings: the
 *   'no-manifest' warning objects (if any) this subtree has contributed to
 *   the shared `warnings` array so far — a parent whose ENTIRE subtree is
 *   dead can supersede/remove these in favor of its own single, broader
 *   warning instead of reporting the same dead-end at multiple depths.
 */
async function migrateRealFolders(dir, vaultPath, categoryChain, depth, warnings) {
  if (depth > MAX_SCAN_DEPTH) {
    warnings.push({ path: dir, code: 'depth-limit', message: `Nested more than ${MAX_SCAN_DEPTH} levels deep` });
    return { foundAny: false, noManifestWarnings: [] };
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    warnings.push(await describeReadError(dir, err));
    return { foundAny: false, noManifestWarnings: [] };
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
      return { foundAny: false, noManifestWarnings: [] };
    }
    return { foundAny: true, noManifestWarnings: [] }; // never recurse into an addon's own internals
  }

  const subEntries = entries.filter(e => !e.name.startsWith('.') && (e.isDirectory() || e.isSymbolicLink()));
  let foundAny = false;
  const childNoManifestWarnings = [];
  for (const entry of subEntries) {
    // Symlinked category folders (unusual, but possible) still need
    // descending into — check isDirectory() OR isSymbolicLink() so we don't
    // silently stop at a link the way a naive isDirectory()-only check would
    // (Dirent reports the link's own type, not what it resolves to).
    const result = await migrateRealFolders(path.join(dir, entry.name), vaultPath, [...categoryChain, entry.name], depth + 1, warnings);
    foundAny = foundAny || result.foundAny;
    childNoManifestWarnings.push(...result.noManifestWarnings);
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
    // This folder's entire subtree is dead — remove any more specific
    // child-level warnings already queued underneath it (e.g. a _CVT_
    // folder whose only child is an empty SIMOBJECTS folder). This
    // message already says "anywhere inside", so keeping both would just
    // double-count the exact same one broken/incomplete install as two
    // separate warnings.
    for (const w of childNoManifestWarnings) {
      const idx = warnings.indexOf(w);
      if (idx !== -1) warnings.splice(idx, 1);
    }
    const warning = { path: dir, code: 'no-manifest', message: 'No manifest.json/layout.json anywhere inside' };
    warnings.push(warning);
    return { foundAny: false, noManifestWarnings: [warning] };
  }

  return { foundAny, noManifestWarnings: childNoManifestWarnings };
}

/**
 * A plain ENOENT on readdir is ambiguous — could be a permissions issue, a
 * race with another process, or (very commonly in practice, confirmed
 * against a real library) a dangling junction whose target folder was
 * moved, renamed, or deleted from outside FlightSync (e.g. reorganizing an
 * Addons-Linker-style external library). Distinguish the last case and name
 * the actual dead target so the user knows exactly what broke, instead of a
 * bare "ENOENT".
 */
async function describeReadError(dir, err) {
  if (err.code === 'ENOENT') {
    try {
      const stat = await fs.lstat(dir);
      if (stat.isSymbolicLink()) {
        const target = await fs.readlink(dir).catch(() => null);
        return {
          path: dir,
          code: 'broken-link',
          message: target
            ? `Points to "${target}", which no longer exists — moved, renamed, or deleted outside FlightSync.`
            : 'Its target folder no longer exists — moved, renamed, or deleted outside FlightSync.',
        };
      }
    } catch {
      // dir itself is gone too (e.g. deleted between the parent's readdir
      // and this call) — fall through to the generic message below.
    }
  }
  return { path: dir, code: 'read-error', message: err.code ?? err.message };
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
        const message = err.code === 'EBUSY'
          ? 'In use by another program (MSFS, SimBridge, or an antivirus scan?) — close it and rescan.'
          : (err.code ?? err.message);
        warnings.push({ path: realPath, code: 'migrate-error', message });
        return;
      }
    }
  } else {
    // vaultTarget already exists even though realPath is still a genuine
    // (non-symlink) folder sitting in Community — meaning EITHER this is a
    // crash-interrupted migration of this exact same folder (vault copy
    // already made, source/symlink swap never finished), OR a completely
    // different real addon elsewhere in Community that just happens to
    // share this leaf name, colliding with one already migrated.
    //
    // Confirmed as a real, serious bug: this used to just fs.rm(realPath)
    // unconditionally, assuming the former case — for the latter case that
    // silently deleted a user's actual addon files, then left a junction
    // in its place pointing at a completely unrelated addon's vault copy.
    // There's no cheap, reliable way to tell the two cases apart (content
    // hashing a potentially huge scenery folder just to migrate it isn't
    // reasonable), so never delete here — warn and leave the source
    // folder alone. The user resolves it exactly like any other name
    // conflict: rename one of the two folders, then rescan. This is a
    // strict safety improvement even though it means a same-named
    // collision discovered at first-migration time can't (yet) be
    // resolved via LibraryView's in-app rename control the way an
    // already-migrated vault-side conflict can — the conflicting folder
    // simply isn't in the vault for that control to act on until it's
    // been renamed by hand once, outside FlightSync.
    warnings.push({
      path: realPath,
      code: 'name-conflict',
      message: `A different addon already occupies "${folderName}" in the vault — rename this folder (or the other one) before FlightSync can manage both. Left untouched, nothing was deleted.`,
    });
    return;
  }

  await fs.symlink(vaultTarget, realPath, process.platform === 'win32' ? 'junction' : 'dir');
}

async function walkVault(absoluteDir, vaultRoot, categoryChain, results, depth, warnings, learnedTokens) {
  if (depth > MAX_SCAN_DEPTH) {
    warnings.push({ path: absoluteDir, code: 'depth-limit', message: `Nested more than ${MAX_SCAN_DEPTH} levels deep` });
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    warnings.push(await describeReadError(absoluteDir, err));
    return;
  }

  const isAddonRoot = entries.some(e => e.isFile() && (e.name === 'manifest.json' || e.name === 'layout.json'));

  if (isAddonRoot) {
    const folderName = path.basename(absoluteDir);
    try {
      const addon = await scanOneAddon(absoluteDir, folderName, categoryChain, learnedTokens);
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
    await walkVault(path.join(absoluteDir, entry.name), vaultRoot, [...categoryChain, entry.name], results, depth + 1, warnings, learnedTokens);
  }
}

async function scanOneAddon(absolutePath, folderName, categoryChain, learnedTokens = EMPTY_LEARNED_TOKENS) {
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
  // manifest.json also carries a creator/manufacturer field on most modern
  // packages — cheap extra signal for the aircraft/airline pattern matchers
  // below (e.g. a virtual-airline-branded livery whose folder name alone
  // wouldn't spell out the airline, but manifest.creator does).
  const creatorHintText = manifest?.creator ?? manifest?.manufacturer ?? '';
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

  const combinedText = `${folderName} ${title} ${categoryHintText} ${creatorHintText}`;

  let candidateIcaos = [];
  let matchedIcao = null;
  if (contentType === 'SCENERY') {
    // layout.json lists every file the package ships (bgl paths etc.) —
    // often spells out the exact ICAO even when the folder name/title/
    // category are all too generic to match on their own (a rebrand, a
    // vague "Airport Enhancement X" title, no manifest at all).
    const layoutHintText = await readLayoutContentHints(absolutePath);
    candidateIcaos = dedupe([
      ...extractIcaoCodes(folderName),
      ...extractIcaoCodes(title),
      ...extractIcaoCodes(categoryHintText),
      ...extractIcaoCodes(layoutHintText),
    ]);

    // Confidence-scored resolution: even with multiple raw regex candidates,
    // auto-resolve when exactly one sits in a position a human would trust
    // instantly ("[EDDM]", "EDDM - Munich", a known studio tag right before
    // it, independently corroborated across 2+ of the source fields, etc).
    // Only genuinely ambiguous cases fall through to the manual queue — and
    // even those get one more chance against this user's own past manual
    // corrections (learnedPatterns.js) before finally giving up.
    matchedIcao = resolveConfidentIcao(combinedText, candidateIcaos, [folderName, title, categoryHintText, layoutHintText])
      ?? lookupLearnedValue(learnedTokens.icao, combinedText);
  }

  let matchedAircraftType = null;
  if (contentType === 'LIVERY' || contentType === 'AIRCRAFT') {
    matchedAircraftType = guessAircraftType(combinedText) ?? lookupLearnedValue(learnedTokens.aircraftType, combinedText);
  }

  let matchedAirline = null;
  if (contentType === 'LIVERY') {
    matchedAirline = guessAirlineCode(combinedText) ?? lookupLearnedValue(learnedTokens.airline, combinedText);
  }

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
    confirmed: deriveConfirmed(contentType, matchedIcao, matchedAircraftType),
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

// Shared by the heuristic scanner and the AI classification fallback
// (aiClassifier.js) so a manually-confirmed vs. still-needs-review addon is
// decided by exactly one rule, never two copies that could drift apart.
// SCENERY needs a resolved airport; AIRCRAFT/LIVERY need a resolved type;
// OTHER has nothing further to resolve, so it's never auto-confirmed here —
// it always goes through the manual confirm queue once, same as today.
export function deriveConfirmed(contentType, matchedIcao, matchedAircraftType) {
  if (!CONTENT_TYPES.includes(contentType)) return false;
  if (contentType === 'SCENERY') return Boolean(matchedIcao);
  if (contentType === 'AIRCRAFT' || contentType === 'LIVERY') return Boolean(matchedAircraftType);
  return false;
}

// Aircraft ICAO type codes — both descriptive-name patterns AND the bare
// ICAO type code itself (most liveries have the literal type code
// somewhere in the folder name, e.g. "A21N", "B738" — checking for that
// directly, not just the spelled-out name, is what catches most of them
// without needing manual confirmation).
// A hyphen or underscore separates almost every multi-word folder/title in
// this app's real-world addon names ("british-airways-a320",
// "cathay_pacific_777") — a bare \s (whitespace-only) gap between two
// words in a regex never matches either. Every multi-word pattern below
// uses this class instead of \s so hyphen/underscore/space are all treated
// as the same "word gap".
const SEP = '[-_\\s]';

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
  ['B38M', new RegExp(`\\b737${SEP}?max${SEP}?8\\b|\\bb38m\\b`, 'i')],
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
  ['C172', new RegExp(`\\bc172\\b|\\bcessna${SEP}?172\\b`, 'i')],
  ['PA28', new RegExp(`\\bpa-?28\\b|\\bpiper${SEP}?(archer|cherokee)\\b`, 'i')],
  ['TBM9', /\btbm[-_ ]?9(00|30)\b/i],
  // Batch 2 — widened to cover more of the real-world MSFS payware/freeware
  // and default-aircraft catalog beyond the original narrowbody-heavy seed
  // list, still every entry a real, standard ICAO type designator.
  ['A318', /\ba318\b/i],
  ['A333', /\ba330-?300\b|\ba333\b/i],
  ['B748', /\b747-?8\b|\bb748\b/i],
  ['B78X', /\b787-?10\b|\bb78x\b/i],
  ['CRJ7', /\bcrj-?700\b|\bcrj7\b/i],
  ['CRJ2', /\bcrj-?200\b|\bcrj2\b/i],
  ['E170', /\be-?170\b/i],
  ['E145', /\be-?145\b/i],
  ['AT76', new RegExp(`\\batr${SEP}?-?72-?600\\b|\\bat76\\b`, 'i')],
  ['AT72', new RegExp(`\\batr${SEP}?-?72\\b|\\bat72\\b`, 'i')],
  ['DH8D', new RegExp(`\\bdash${SEP}?8\\b|\\bq400\\b|\\bdh8d\\b`, 'i')],
  ['B350', new RegExp(`\\bking${SEP}?air${SEP}?350\\b|\\bb350i?\\b`, 'i')],
  ['BE20', new RegExp(`\\bking${SEP}?air${SEP}?200\\b|\\bbe20\\b`, 'i')],
  ['C208', /\bcaravan\b|\bc208(b)?\b/i],
  ['C152', new RegExp(`\\bc152\\b|\\bcessna${SEP}?152\\b`, 'i')],
  ['C182', new RegExp(`\\bc182\\b|\\bcessna${SEP}?182\\b`, 'i')],
  ['SR22', new RegExp(`\\bsr22\\b|\\bcirrus${SEP}?sr-?22\\b`, 'i')],
  ['SR20', new RegExp(`\\bsr20\\b|\\bcirrus${SEP}?sr-?20\\b`, 'i')],
  ['DA62', new RegExp(`\\bda[-_ ]?62\\b|\\bdiamond${SEP}?da62\\b`, 'i')],
  ['DA42', new RegExp(`\\bda[-_ ]?42\\b|\\bdiamond${SEP}?da42\\b`, 'i')],
  ['DA40', new RegExp(`\\bda[-_ ]?40\\b|\\bdiamond${SEP}?da40\\b`, 'i')],
  ['PC12', new RegExp(`\\bpc-?12\\b|\\bpilatus${SEP}?pc-?12\\b`, 'i')],
  ['TBM8', /\btbm[-_ ]?(700|850)\b/i],
];

export function guessAircraftType(text) {
  const normalized = normalizeUnderscores(text);
  for (const [code, pattern] of AIRCRAFT_TYPE_PATTERNS) {
    if (pattern.test(normalized)) return code;
  }
  return null;
}

// Airline ICAO codes — extended list covering the majors most liveries in
// the wild are actually for, beyond the original TRvACC-relevant seed set.
const AIRLINE_PATTERNS = [
  ['THY', new RegExp(`\\bturkish${SEP}*airlines?\\b|\\bthy\\b`, 'i')],
  ['PGT', /\bpegasus\b/i],
  ['DLH', /\blufthansa\b|\bdlh\b/i],
  ['CFG', /\bcondor\b/i],
  ['UAE', /\bemirates\b/i],
  ['QTR', new RegExp(`\\bqatar${SEP}*airways?\\b`, 'i')],
  ['BAW', new RegExp(`\\bbritish${SEP}*airways?\\b|\\bbaw\\b`, 'i')],
  ['AFR', new RegExp(`\\bair${SEP}*france\\b`, 'i')],
  ['UAL', /\bunited\b/i],
  ['DAL', /\bdelta\b/i],
  ['RYR', /\bryanair\b/i],
  ['EZY', /\beasyjet\b/i],
  ['KLM', /\bklm\b/i],
  ['IBE', /\biberia\b/i],
  ['SWR', /\bswiss\b/i],
  ['AUA', new RegExp(`\\baustrian${SEP}*airlines?\\b`, 'i')],
  ['WZZ', new RegExp(`\\bwizz${SEP}?air\\b`, 'i')],
  ['VLG', /\bvueling\b/i],
  ['NAX', /\bnorwegian\b/i],
  ['SAS', /\bscandinavian\b|\bsas\b/i],
  ['FIN', /\bfinnair\b/i],
  ['AFL', /\baeroflot\b/i],
  ['AAL', new RegExp(`\\bamerican${SEP}*airlines?\\b|\\baal\\b`, 'i')],
  ['SWA', /\bsouthwest\b/i],
  ['JBU', /\bjetblue\b/i],
  ['ASA', new RegExp(`\\balaska${SEP}*airlines?\\b`, 'i')],
  ['ACA', new RegExp(`\\bair${SEP}*canada\\b`, 'i')],
  ['CPA', new RegExp(`\\bcathay${SEP}*pacific\\b`, 'i')],
  ['ANA', new RegExp(`\\ball${SEP}*nippon\\b|\\bana\\b`, 'i')],
  ['JAL', new RegExp(`\\bjapan${SEP}*airlines?\\b|\\bjal\\b`, 'i')],
  ['SIA', new RegExp(`\\bsingapore${SEP}*airlines?\\b`, 'i')],
  ['QFA', /\bqantas\b/i],
  ['ETD', /\betihad\b/i],
  ['SVA', /\bsaudia\b/i],
  // Batch 2 — every entry below is a real, standard ICAO airline
  // designator, spelled-out-name patterns only (no bare 3-letter code
  // alternative for ones whose code doubles as a common English word, e.g.
  // LOT/TAP, to avoid a false match on completely unrelated addon names).
  ['LOT', new RegExp(`\\bpolish${SEP}*airlines?\\b|\\blot${SEP}*polish\\b`, 'i')],
  ['TAP', new RegExp(`\\btap${SEP}*(air${SEP}*)?portugal\\b`, 'i')],
  ['ICE', /\bicelandair\b/i],
  ['AEE', /\baegean\b/i],
  ['CTN', new RegExp(`\\bcroatia${SEP}*airlines?\\b`, 'i')],
  ['TRA', /\btransavia\b/i],
  ['BTI', new RegExp(`\\bair${SEP}*baltic\\b`, 'i')],
  ['RAM', new RegExp(`\\broyal${SEP}*air${SEP}*maroc\\b`, 'i')],
  ['SAA', new RegExp(`\\bsouth${SEP}*african${SEP}*airways?\\b`, 'i')],
  ['KQA', new RegExp(`\\bkenya${SEP}*airways?\\b`, 'i')],
  ['ETH', /\bethiopian\b/i],
  ['ELY', new RegExp(`\\bel${SEP}*al\\b`, 'i')],
  ['VIR', new RegExp(`\\bvirgin${SEP}*atlantic\\b`, 'i')],
  ['VOZ', new RegExp(`\\bvirgin${SEP}*australia\\b`, 'i')],
  ['LAN', /\blatam\b/i],
  ['AVA', /\bavianca\b/i],
  ['CMP', new RegExp(`\\bcopa${SEP}*airlines?\\b`, 'i')],
  ['AMX', /\baeromexico\b/i],
  ['WJA', /\bwestjet\b/i],
  ['HAL', new RegExp(`\\bhawaiian${SEP}*airlines?\\b`, 'i')],
  ['FFT', new RegExp(`\\bfrontier${SEP}*airlines?\\b`, 'i')],
  ['NKS', new RegExp(`\\bspirit${SEP}*airlines?\\b`, 'i')],
  ['AAY', /\ballegiant\b/i],
  ['SCX', new RegExp(`\\bsun${SEP}*country\\b`, 'i')],
  ['VOI', /\bvolaris\b/i],
  ['HVN', new RegExp(`\\bvietnam${SEP}*airlines?\\b`, 'i')],
  ['THA', new RegExp(`\\bthai${SEP}*airways?\\b`, 'i')],
  ['CSN', new RegExp(`\\bchina${SEP}*southern\\b`, 'i')],
  ['CES', new RegExp(`\\bchina${SEP}*eastern\\b`, 'i')],
  ['CCA', new RegExp(`\\bair${SEP}*china\\b`, 'i')],
  ['CHH', new RegExp(`\\bhainan${SEP}*airlines?\\b`, 'i')],
  ['KAL', new RegExp(`\\bkorean${SEP}*air\\b`, 'i')],
  ['AAR', /\basiana\b/i],
  ['EVA', new RegExp(`\\beva${SEP}*air\\b`, 'i')],
  ['CAL', new RegExp(`\\bchina${SEP}*airlines\\b`, 'i')],
  ['PAL', new RegExp(`\\bphilippine${SEP}*airlines?\\b`, 'i')],
  ['GIA', /\bgaruda\b/i],
  ['AXM', /\bairasia\b/i],
  ['MAS', new RegExp(`\\bmalaysia${SEP}*airlines?\\b`, 'i')],
  ['AIC', new RegExp(`\\bair${SEP}*india\\b`, 'i')],
  ['IGO', /\bindigo\b/i],
];

export function guessAirlineCode(text) {
  const normalized = normalizeUnderscores(text);
  for (const [code, pattern] of AIRLINE_PATTERNS) {
    if (pattern.test(normalized)) return code;
  }
  return null;
}

// JS regex \b treats "_" as a word character, so a \b immediately before or
// after an underscore never actually finds a boundary there — an
// underscore-separated folder name like "c172_g1000" would silently fail
// to match even a bare /\bc172\b/ pattern (icaoDatabase.js's
// extractIcaoCodes has the identical fix for the same reason). Normalizing
// underscores to spaces once, here, fixes every pattern in both lists
// above uniformly instead of rewriting every individual \b.
function normalizeUnderscores(text) {
  return text.replace(/_/g, ' ');
}

// MSFS packages list every shipped file's relative path in layout.json's
// `content` array (e.g. "scenery/world/scenery/APX0_EDDM.bgl"). Bounded to
// the first 2000 entries / 20000 joined characters — plenty to catch an
// ICAO-bearing filename near the top of even a huge scenery package without
// risking a slow regex pass over a multi-megabyte file list. Best-effort:
// missing, malformed, or unreadable layout.json just yields no extra hint.
async function readLayoutContentHints(absolutePath) {
  try {
    const raw = await fs.readFile(path.join(absolutePath, 'layout.json'), 'utf-8');
    const layout = JSON.parse(raw);
    if (!Array.isArray(layout?.content)) return '';
    const paths = layout.content.slice(0, 2000).map(entry => entry?.path).filter(Boolean);
    return paths.join(' ').slice(0, 20000);
  } catch {
    return '';
  }
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

export function hashPath(p) {
  return crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
}

/**
 * Renames an addon's folder in place inside the vault — the fix for a
 * folder-name conflict (two addons that collide because MSFS can only ever
 * link one Community-folder entry per name; see markNameConflicts above).
 * Only ever touches the vault copy, never the Community symlink itself —
 * on the next scan the addon's folderName simply comes out different, and
 * whatever previously pointed at the old Community-folder name is picked
 * up fresh through the normal sync flow rather than being patched here.
 *
 * @param {string} absolutePath   the addon's current vault folder path
 * @param {string} newFolderName desired new leaf folder name
 * @returns {Promise<string>} the new absolute path
 */
export async function renameVaultFolder(absolutePath, newFolderName) {
  const trimmed = (newFolderName ?? '').trim();
  if (!trimmed) throw new Error('New folder name cannot be empty.');
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    throw new Error('Folder name can\'t contain \\ / : * ? " < > |');
  }

  const parentDir = path.dirname(absolutePath);
  const newAbsolutePath = path.join(parentDir, trimmed);

  if (path.resolve(newAbsolutePath) === path.resolve(absolutePath)) {
    throw new Error('That\'s already the current name.');
  }
  if (await exists(newAbsolutePath)) {
    throw new Error(`"${trimmed}" already exists in this location.`);
  }

  await fs.rename(absolutePath, newAbsolutePath);
  return newAbsolutePath;
}

function hashContent(c) {
  return crypto.createHash('sha1').update(c).digest('hex').slice(0, 16);
}
