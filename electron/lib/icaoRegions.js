// electron/lib/icaoRegions.js
//
// Approximate ICAO-prefix -> region lookup, used to auto-tag scenery addons
// with a broad geographic region so the Library view can offer filters like
// "Airports > Middle East" without requiring the user to physically
// organize addons into folders (that was the old Addons Linker-style
// approach — this replaces it with UI-driven filtering on metadata instead).
//
// This is deliberately approximate — ICAO regional prefixes don't map
// perfectly onto cultural/geographic regions (Turkey, Russia, and the
// Caribbean are the classic edge cases). Anything not confidently resolved
// returns null, which the UI treats as "needs manual region" — same
// philosophy as ICAO/aircraft-type matching elsewhere in this app: auto
// first, manual fallback always available.

const REGIONS = {
  'North America': ['K', 'C', 'M', 'T', 'PA', 'PH'],
  'South America': ['S'],
  'Europe': ['E', 'L', 'B'],
  'Middle East': ['O'],
  'Africa': ['F', 'G', 'H', 'D'],
  'Asia': ['U', 'V', 'W', 'Z', 'R'],
  'Oceania': ['Y', 'N', 'A', 'P'],
};

// Build a flat prefix -> region map, longest prefixes checked first so e.g.
// "PH" (Hawaii -> North America) wins over the broader "P" (-> Oceania).
const PREFIX_ENTRIES = Object.entries(REGIONS)
  .flatMap(([region, prefixes]) => prefixes.map(prefix => [prefix, region]))
  .sort((a, b) => b[0].length - a[0].length);

export function regionForIcao(icao) {
  if (!icao || icao.length < 2) return null;
  const upper = icao.toUpperCase();
  for (const [prefix, region] of PREFIX_ENTRIES) {
    if (upper.startsWith(prefix)) return region;
  }
  return null;
}

export const KNOWN_REGIONS = Object.keys(REGIONS);
