// electron/lib/icaoDatabase.js
//
// Small bundled ICAO <-> airport-name lookup table. This is NOT meant to be
// exhaustive — it exists purely as a fallback for the rare addon whose
// folder/title doesn't already contain a bare ICAO code but does contain a
// recognizable airport name ("Munich Airport X", "Franz Josef Strauss").
//
// TODO (v1.1): replace this hardcoded slice with a bundled JSON generated
// from the OurAirports public dataset (https://ourairports.com/data/) at
// build time, filtered to large_airport + medium_airport. That gives ~4,500
// ICAOs with names/aliases instead of the ~40 hand-picked ones below.

export const ICAO_BY_NAME = {
  // Germany (Devran's home region — seed these first)
  'munich': 'EDDM',
  'franz josef strauss': 'EDDM',
  'frankfurt': 'EDDF',
  'berlin brandenburg': 'EDDB',
  'hamburg': 'EDDH',
  'dusseldorf': 'EDDL',
  'duesseldorf': 'EDDL',
  'cologne bonn': 'EDDK',
  'bonn': 'EDDK',
  'stuttgart': 'EDDS',
  'nuremberg': 'EDDN',

  // Turkey
  'istanbul': 'LTFM',
  'istanbul airport': 'LTFM',
  'sabiha gokcen': 'LTFJ',
  'ankara esenboga': 'LTAC',
  'izmir adnan menderes': 'LTBJ',
  'antalya': 'LTAI',

  // Major global hubs (common addon subjects)
  'heathrow': 'EGLL',
  'gatwick': 'EGKK',
  'schiphol': 'EHAM',
  'charles de gaulle': 'LFPG',
  'zurich': 'LSZH',
  'vienna': 'LOWW',
  'madrid barajas': 'LEMD',
  'barcelona': 'LEBL',
  'rome fiumicino': 'LIRF',
  'jfk': 'KJFK',
  'kennedy': 'KJFK',
  'los angeles': 'KLAX',
  'san francisco': 'KSFO',
  'chicago ohare': 'KORD',
  'miami': 'KMIA',
  'dubai': 'OMDB',
  'doha hamad': 'OTHH',
  'singapore changi': 'WSSS',
  'tokyo haneda': 'RJTT',
  'tokyo narita': 'RJAA',
};

/** Matches a bare 4-letter ICAO code as a whole word, e.g. "EDDM" in "FlyByWire-EDDM-v2". */
const ICAO_REGEX = /\b([A-Z]{4})\b/;

/**
 * Attempts to resolve one or more ICAO codes referenced by a string
 * (typically an addon folder name or manifest title).
 *
 * @param {string} raw
 * @returns {string[]} zero, one, or more matched ICAO codes (deduped)
 */
export function extractIcaoCodes(raw) {
  if (!raw) return [];
  const found = new Set();

  // 1. Direct ICAO pattern match (covers the vast majority of scenery addons —
  //    "fspro-eddm-munich", "[FSDT] KJFK v3", "orbx_eddh_hamburg")
  const upper = raw.toUpperCase();
  const matches = upper.match(new RegExp(ICAO_REGEX, 'g')) || [];
  for (const m of matches) {
    // Filter out common false positives: version tags, resolution tags etc.
    // that happen to be 4 uppercase letters (rare, but "TRUE", "GOLD" ship as
    // marketing suffixes on some product names).
    if (!FALSE_POSITIVE_WORDS.has(m)) found.add(m);
  }

  // 2. Fallback: known airport name substring match. Normalize hyphens/
  //    underscores to spaces first — folder names almost always use those
  //    as word separators ("eddk-cologne-bonn"), but ICAO_BY_NAME's keys are
  //    written with real spaces ("cologne bonn"), so without this the two
  //    never matched at all (confirmed real bug: "aerosoft-airport-eddk-
  //    cologne-bonn" never corroborated EDDK because "cologne bonn" with a
  //    space is not a substring of "...eddk-cologne-bonn").
  const lower = normalizeSeparators(raw);
  for (const [name, icao] of Object.entries(ICAO_BY_NAME)) {
    if (lower.includes(name)) found.add(icao);
  }

  return [...found];
}

function normalizeSeparators(text) {
  return text.toLowerCase().replace(/[-_]+/g, ' ');
}

/**
 * Picks the single most likely ICAO out of a set of raw regex candidates by
 * checking for "strong signal" positioning — the kind of placement a human
 * skimming the folder name would also trust instantly. This is what lets
 * FlightSync auto-confirm addons whose names are already unambiguous to a
 * person ("EDDM - Munich Enhanced", "[LTFM] Istanbul Airport") without
 * making the user manually confirm every single one, while still falling
 * back to manual review whenever the evidence is genuinely ambiguous (e.g.
 * a folder name containing both the real ICAO and an unrelated 4-letter
 * word like a place name — "OTHH-Doha" also matches "DOHA").
 *
 * Strong signals:
 *  - the code sits inside [BRACKETS] or (PARENS)
 *  - the code is the very first token in the string
 *  - the code is immediately followed by " - " or "_" then a capitalized
 *    word, i.e. looks like "ICAO - Place Name"
 *  - the code is independently corroborated by a known airport-name match
 *    in the same text (both "EDDM" and "munich" appear together)
 *
 * @param {string} text          combined folder name + title + category hint
 * @param {string[]} candidates  raw candidate ICAOs already found by extractIcaoCodes
 * @returns {string|null} the confidently-resolved ICAO, or null if still ambiguous
 */
export function resolveConfidentIcao(text, candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const upper = text.toUpperCase();
  const lower = normalizeSeparators(text);
  const strong = candidates.filter(code => {
    if (new RegExp(`[\\[(]${code}[\\])]`).test(upper)) return true;
    if (new RegExp(`^\\s*${code}\\b`).test(upper.trim())) return true;
    // Corroborated by a known place name for that same ICAO appearing in the text
    for (const [name, icao] of Object.entries(ICAO_BY_NAME)) {
      if (icao === code && lower.includes(name)) return true;
    }
    return false;
  });

  return strong.length === 1 ? strong[0] : null;
}

// Words that happen to be 4 uppercase letters but are NOT airport ICAO
// codes — either generic marketing/version terms, or (the much more common
// case in practice) scenery/aircraft developer studio tags that ship in
// nearly every one of their product folder names. Confirmed via a smoke
// test: "orbx-ltfm-istanbul" was matching both LTFM (correct) and ORBX
// (false positive), pushing an otherwise-unambiguous addon into the manual
// confirm queue for no reason.
//
// This list is necessarily incomplete — extend it as false positives show
// up in the Library "needs confirmation" queue. Real ICAO codes are never
// added here even if they coincidentally collide with a studio tag.
const FALSE_POSITIVE_WORDS = new Set([
  // generic marketing/version terms
  'TRUE', 'GOLD', 'FREE', 'BETA', 'DEMO', 'FULL', 'HIGH', 'BASE', 'CORE',
  'MAIN', 'DATA', 'MODS', 'ADDS', 'PACK', 'REAL', 'TYPE', 'ALPHA',
  // common scenery/aircraft developer studio tags
  'ORBX', 'PMDG', 'FSDT', 'FLYB', 'IFLY', 'TFDI', 'JFPS', 'FSPX', 'ASXP',
  'MSFS', 'FSPR', 'SIMW', 'AIGL',
  // generic airport-naming words and name fragments that happen to be
  // exactly 4 letters (the regex only ever matches 4-letter sequences, so
  // longer filler words like "NORTH"/"FIELD" would never be candidates in
  // the first place) — found via real confirm-queue entries: "INTL" (e.g.
  // "LTDX-LTDB-INTL"), "CITY" ("...-city-frankfurt"), "SUED" (German
  // "south", "Schweinfurt Sued"), "LECH" (person name, "...-lech-walesa"),
  // "NHAT" ("Tan Son Nhat"), "PAUL" ("...-st-paul-airport")
  'INTL', 'CITY', 'SUED', 'LECH', 'NHAT', 'PAUL', 'PARK', 'WEST', 'EAST', 'ISLE',
]);
