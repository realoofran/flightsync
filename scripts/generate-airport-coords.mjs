// One-off dev script: downloads the public OurAirports dataset and generates
// a small bundled airportCoords.json (ICAO -> [lat, lon]), filtered to
// large_airport + medium_airport (the sizes community scenery addons are
// actually built for). This is the "TODO (v1.1)" already called out in
// icaoDatabase.js's header comment — a real coordinate source instead of
// hand-picking a few dozen airports.
//
// Written to BOTH src/lib/ and electron/lib/ — identical content, two
// copies, not a shared import. The renderer (SceneryMap.jsx, RouteMap.jsx,
// greatCircle.js) reads the src/lib/ copy via a plain Vite JSON import; the
// main process (flightMatcher.js's enroute-scenery matching) needs its own
// copy because Vite only bundles dist/ and electron/**/* ships as-is into
// the packaged app — src/ is NOT included in a real build, so a main-process
// `fs.readFileSync` reaching into src/lib/ would work in dev and silently
// fail once packaged. Not run at app runtime either way — both are static
// data files read synchronously, like any other bundled asset. Re-run via
// `npm run airports` only if the dataset needs refreshing; keeps both
// copies in sync automatically.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPaths = [
  path.join(__dirname, '..', 'src', 'lib', 'airportCoords.json'),
  path.join(__dirname, '..', 'electron', 'lib', 'airportCoords.json'),
];
const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const KEEP_TYPES = new Set(['large_airport', 'medium_airport']);

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch OurAirports dataset: ${res.status}`);
  const csv = await res.text();

  const rows = parseCsv(csv);
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const idxType = col('type');
  const idxLat = col('latitude_deg');
  const idxLon = col('longitude_deg');
  const idxIcao = col('icao_code');
  const idxIdent = col('ident');

  const out = {};
  let kept = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !KEEP_TYPES.has(row[idxType])) continue;

    const icaoRaw = (row[idxIcao] || row[idxIdent] || '').toUpperCase().trim();
    if (!/^[A-Z]{4}$/.test(icaoRaw)) continue;

    const lat = Number(row[idxLat]);
    const lon = Number(row[idxLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    out[icaoRaw] = [round(lat), round(lon)];
    kept++;
  }

  const json = JSON.stringify(out);
  await Promise.all(outPaths.map(p => writeFile(p, json)));
  console.log(`Wrote ${outPaths.join(' and ')} (${kept} airports)`);
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

// Minimal RFC4180-ish CSV parser — handles quoted fields containing commas
// (airport names routinely do, e.g. "Munich, Franz Josef Strauss").
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
