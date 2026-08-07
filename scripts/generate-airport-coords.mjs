// One-off dev script: downloads the public OurAirports dataset and generates
// a small bundled electron/lib/airportCoords.json (ICAO -> [lat, lon]),
// filtered to large_airport + medium_airport (the sizes community scenery
// addons are actually built for). This is the "TODO (v1.1)" already called
// out in icaoDatabase.js's header comment — a real coordinate source instead
// of hand-picking a few dozen airports — and is what powers the scenery map
// view (src/components/SceneryMap.jsx).
//
// Written to src/lib/ (not electron/lib/) because it's only ever consumed
// by the renderer (SceneryMap.jsx), which Vite bundles directly via a plain
// JSON import — same as RouteMap.jsx's purely client-side geo projection,
// no IPC round-trip needed for static reference data. Not run at app
// runtime — the generated JSON ships bundled and is read synchronously
// like any other static data file. Re-run via `npm run airports` only if
// the dataset needs refreshing.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'lib', 'airportCoords.json');
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

  await writeFile(outPath, JSON.stringify(out));
  console.log(`Wrote ${outPath} (${kept} airports)`);
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
