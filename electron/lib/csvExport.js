// electron/lib/csvExport.js
//
// Pure CSV-building for the Library's "Export as CSV" button — a plain
// data-portability feature (share your addon inventory, keep a record
// before a reinstall, open it in a spreadsheet) with no dependency on a
// CSV library, same "a few dozen lines of real logic doesn't need a
// package" approach as the rest of this app's file-format code (see
// generate-airport-coords.mjs's own hand-rolled CSV parser).

const COLUMNS = [
  ['Title', a => a.title],
  ['Folder Name', a => a.folderName],
  ['Content Type', a => a.contentType],
  ['Region', a => a.region ?? ''],
  ['Matched ICAO', a => a.matchedIcao ?? ''],
  ['Matched Aircraft Type', a => a.matchedAircraftType ?? ''],
  ['Matched Airline', a => a.matchedAirline ?? ''],
  ['Confirmed', a => (a.confirmed ? 'Yes' : 'No')],
  ['Always Active', a => (a.alwaysActive ? 'Yes' : 'No')],
];

/**
 * RFC4180-ish field escaping: only quote a field when it actually needs
 * it (contains a comma, quote, or line break), doubling any internal
 * quotes — matches the same convention generate-airport-coords.mjs's CSV
 * *parser* already assumes when reading OurAirports' data.
 */
function escapeCsvField(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {import('./addonScanner.js').Addon[]} addons
 * @returns {string} full CSV text, CRLF line endings (the RFC4180 default,
 *   and what Excel expects without a BOM/encoding fight)
 */
export function buildAddonCsv(addons) {
  const header = COLUMNS.map(([name]) => escapeCsvField(name)).join(',');
  const rows = (addons ?? [])
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(addon => COLUMNS.map(([, get]) => escapeCsvField(get(addon))).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
