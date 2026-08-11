// electron/lib/learnedPatterns.js
//
// Closes a loop the heuristic scanner (addonScanner.js/icaoDatabase.js)
// can't close on its own: every manual confirmation the user makes is
// human-verified ground truth about THEIR library specifically, but until
// now it only ever updated that one addon's DB row — the exact same
// folder-naming pattern would need a manual confirmation again for every
// other addon that happened to share it. This module lets
// confirmAddonMatch() (db.js) record the significant, distinguishing words
// from an addon's own name the moment the heuristic missed it or got it
// wrong, so scanOneAddon() (addonScanner.js) can consult that memory as a
// fallback on the next scan — for this user's library only, never shared,
// bundled, or synced anywhere.
//
// Deliberately conservative about what gets learned, since a bad learned
// mapping silently mis-detects a DIFFERENT future addon with no review step
// (unlike the heuristic scanner, which always falls back to the manual
// queue whenever it's unsure):
//   - only single, reasonably long words (>=5 chars) are eligible — short,
//     generic fragments are exactly the false-positive-prone tokens
//     icaoDatabase.js's FALSE_POSITIVE_WORDS already fights against.
//   - a fixed stoplist filters generic addon-packaging vocabulary that
//     shows up across totally unrelated addons ("scenery", "official", …).
//   - a token is only learned when it's locally DISTINCTIVE — i.e. it
//     doesn't already appear in more than one other addon already in this
//     user's library. A word repeated across many addons is far more
//     likely to be a studio/series name (which says nothing about the
//     specific target ICAO/aircraft/airline) than an identifying one.
//   - a lookup only ever returns a value when every matching learned token
//     agrees on the exact same value — any disagreement is treated the
//     same as "still ambiguous" and falls through to the manual queue,
//     exactly like icaoDatabase.js's resolveConfidentIcao does for raw
//     ICAO candidates.

const MIN_TOKEN_LENGTH = 5;

// Generic addon-packaging/marketing vocabulary that shows up across totally
// unrelated addons — learning from these would make one confirmation bleed
// into completely unrelated future addons that merely share a common word.
const STOPWORDS = new Set([
  'scenery', 'sceneries', 'airport', 'airports', 'airline', 'airlines',
  'livery', 'liveries', 'repaint', 'repaints', 'aircraft', 'airplane',
  'airplanes', 'plane', 'planes', 'package', 'addon', 'addons',
  'community', 'folder', 'mods', 'default', 'official', 'improved',
  'improvement', 'enhanced', 'enhancement', 'upgrade', 'update',
  'edition', 'version', 'release', 'simobjects', 'msfs2020', 'msfs2024',
  'flightsim', 'simulator', 'freeware', 'payware', 'premium', 'deluxe',
  'professional', 'special', 'studio', 'studios', 'team', 'design',
  'designs', 'project', 'projects', 'group', 'creations', 'works',
  'simulations', 'graphics',
]);

function significantTokens(text) {
  if (!text) return [];
  const tokens = String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(tok => tok.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(tok) && !STOPWORDS.has(tok));
  return [...new Set(tokens)];
}

/**
 * Builds a token -> occurrence-count map across an entire addon library, so
 * recordLearnedPattern can tell a locally distinctive word (identifies just
 * this one addon) apart from a word that's common across many addons in the
 * same library (almost always a studio/series name, not an identifier).
 * Include the addon being learned from in `addons` — that's what makes a
 * word used only by that one addon register as distinctive (count === 1).
 */
export function buildCorpusTokenCounts(addons) {
  const counts = new Map();
  for (const addon of addons) {
    const tokens = significantTokens(`${addon.folderName ?? ''} ${addon.title ?? ''}`);
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

/**
 * Records `value` against every significant, distinctive word in `text`.
 * @param {Record<string,string>} learnedTable  e.g. db.data.learnedTokens.icao — mutated in place
 * @param {string} text
 * @param {string|null|undefined} value
 * @param {Map<string,number>} [corpusTokenCounts]  from buildCorpusTokenCounts; when omitted, distinctiveness isn't checked (useful in isolated tests)
 */
export function recordLearnedPattern(learnedTable, text, value, corpusTokenCounts) {
  if (!value) return;
  for (const token of significantTokens(text)) {
    if (corpusTokenCounts && (corpusTokenCounts.get(token) ?? 0) > 1) continue;
    learnedTable[token] = value;
  }
}

/**
 * Looks up a previously-learned value for `text`. Returns null (never
 * guesses) unless every learned token found in the text agrees on the same
 * value — a real disagreement between two learned tokens means the memory
 * itself is ambiguous for this text, so it's treated as unresolved, exactly
 * like icaoDatabase.js's resolveConfidentIcao does for raw candidates.
 * @param {Record<string,string>} learnedTable
 * @param {string} text
 * @returns {string|null}
 */
export function lookupLearnedValue(learnedTable, text) {
  if (!learnedTable) return null;
  const values = new Set();
  for (const token of significantTokens(text)) {
    const value = learnedTable[token];
    if (value) values.add(value);
  }
  return values.size === 1 ? [...values][0] : null;
}
