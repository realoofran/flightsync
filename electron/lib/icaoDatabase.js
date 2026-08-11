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

  // Batch 2 — secondary UK/EU hubs, common addon subjects beyond the
  // original majors-only seed.
  'manchester': 'EGCC',
  'bristol': 'EGGD',
  'edinburgh': 'EGPH',
  'glasgow': 'EGPF',
  'belfast international': 'EGAA',
  'luton': 'EGGW',
  'stansted': 'EGSS',
  'milan malpensa': 'LIMC',
  'milan linate': 'LIML',
  'rome ciampino': 'LIRA',
  'naples': 'LIRN',
  'venice': 'LIPZ',
  'lisbon': 'LPPT',
  'porto': 'LPPR',
  'copenhagen': 'EKCH',
  'oslo gardermoen': 'ENGM',
  'stockholm arlanda': 'ESSA',
  'helsinki': 'EFHK',
  'warsaw chopin': 'EPWA',
  'prague': 'LKPR',
  'budapest': 'LHBP',
  'athens': 'LGAV',
  'brussels': 'EBBR',

  // Major US secondary hubs
  'boston logan': 'KBOS',
  'washington dulles': 'KIAD',
  'washington national': 'KDCA',
  'reagan national': 'KDCA',
  'atlanta': 'KATL',
  'dallas fort worth': 'KDFW',
  'denver': 'KDEN',
  'seattle tacoma': 'KSEA',
  'las vegas': 'KLAS',
  'phoenix sky harbor': 'KPHX',
  'houston intercontinental': 'KIAH',
  'orlando': 'KMCO',
  'detroit': 'KDTW',
  'minneapolis': 'KMSP',
  'philadelphia': 'KPHL',
  'charlotte': 'KCLT',
  'salt lake city': 'KSLC',
  'honolulu': 'PHNL',

  // Canada
  'toronto pearson': 'CYYZ',
  'vancouver': 'CYVR',
  'montreal trudeau': 'CYUL',
  'calgary': 'CYYC',

  // Asia
  'hong kong': 'VHHH',
  'seoul incheon': 'RKSI',
  'beijing capital': 'ZBAA',
  'shanghai pudong': 'ZSPD',
  'bangkok suvarnabhumi': 'VTBS',
  'kuala lumpur': 'WMKK',
  'manila ninoy aquino': 'RPLL',
  'jakarta soekarno hatta': 'WIII',
  'delhi': 'VIDP',
  'mumbai': 'VABB',
  'taipei taoyuan': 'RCTP',

  // Middle East
  'abu dhabi': 'OMAA',
  'riyadh king khalid': 'OERK',
  'jeddah king abdulaziz': 'OEJN',
  'kuwait': 'OKBK',
  'bahrain': 'OBBI',
  'muscat': 'OOMS',
  'amman queen alia': 'OJAI',
  'beirut': 'OLBA',
  'tehran imam khomeini': 'OIIE',

  // Africa
  'johannesburg': 'FAOR',
  'cape town': 'FACT',
  'cairo': 'HECA',
  'nairobi jomo kenyatta': 'HKJK',
  'lagos murtala muhammed': 'DNMM',
  'casablanca mohammed v': 'GMMN',
  'addis ababa bole': 'HAAB',

  // Oceania
  'sydney': 'YSSY',
  'melbourne': 'YMML',
  'brisbane': 'YBBN',
  'perth': 'YPPH',
  'auckland': 'NZAA',
  'christchurch': 'NZCH',

  // South America
  'sao paulo guarulhos': 'SBGR',
  'rio de janeiro galeao': 'SBGL',
  'buenos aires ezeiza': 'SAEZ',
  'santiago': 'SCEL',
  'bogota': 'SKBO',
  'lima jorge chavez': 'SPJC',
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
  //    "fspro-eddm-munich", "[FSDT] KJFK v3", "orbx_eddh_hamburg"). Normalize
  //    underscores to spaces first — JS regex \b treats "_" as a word
  //    character, so "APX0_EDDS.bgl" (an extremely common MSFS layout.json
  //    bgl-filename shape) would otherwise never reach a real word boundary
  //    before "EDDS" and silently never match at all. Hyphens already form a
  //    boundary on their own and don't need this.
  const upper = raw.toUpperCase().replace(/_/g, ' ');
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

// Well-known scenery/airport developer tags. Positioned immediately before
// an ICAO candidate ("orbx-eddm-munich", "FSDT KJFK v3"), this is exactly
// the pattern a human skimming a folder name uses to instantly parse
// "studio, then subject" — a strong signal that the OTHER, non-studio
// candidate is the real target, even with no brackets and no known place
// name to corroborate it. Kept separate from icaoDatabase's
// FALSE_POSITIVE_WORDS (which only ever subtracts a studio tag from being
// mistaken FOR an ICAO) — this list actively adds confidence to whatever
// candidate sits next to one of these tags.
const STUDIO_PREFIX_WORDS = [
  'orbx', 'fsdt', 'fsdreamteam', 'flytampa', 'aerosoft', 'justsim',
  'taimodels', 'drzewiecki', 'gaya', 'gayasimulations', 'justflight',
  'inibuilds', 'fspro', 'fsimstudios', 'lvfr', 'latinvfr', 'simwings',
  'verticalsim', 'imaginesim', 'digitaldesign', 'aeksimulations',
  'flightbeam', 'nyscenerydesign', 'justsimstudio', 'fseries', 'fsplus',
];
const STUDIO_PREFIX_PATTERN = STUDIO_PREFIX_WORDS.join('|');

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
 *  - the code is immediately preceded by a known studio/developer tag
 *    ("orbx-eddm-munich")
 *  - the code shows up independently in 2+ of the raw source fields passed
 *    via `fieldTexts` (folder name, manifest title, category-folder hint,
 *    layout.json content paths) — agreement across independent sources is
 *    itself a strong signal even with no positional cue in any single one
 *
 * @param {string} text          combined folder name + title + category hint
 * @param {string[]} candidates  raw candidate ICAOs already found by extractIcaoCodes
 * @param {string[]} [fieldTexts]  the individual source strings `text` was combined from, for cross-field corroboration
 * @returns {string|null} the confidently-resolved ICAO, or null if still ambiguous
 */
export function resolveConfidentIcao(text, candidates, fieldTexts) {
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
    if (new RegExp(`(?:${STUDIO_PREFIX_PATTERN})[\\s\\-_]+${code}\\b`, 'i').test(text)) return true;
    if (fieldTexts) {
      const fieldRegex = new RegExp(`\\b${code}\\b`, 'i');
      const agreeingFields = fieldTexts.filter(t => t && fieldRegex.test(t)).length;
      if (agreeingFields >= 2) return true;
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
