# FlightSync — Project Plan

Automatically links only the MSFS 2024 Community-folder addons required for
your currently planned flight (route, alternates, aircraft, livery), so you
never load 40 airports and 15 liveries you're not using.

## 1. Core concept

- User keeps their **full** addon collection in a "library" folder OUTSIDE
  the live `Community` folder.
- FlightSync scans that library once, matches each addon to an ICAO /
  aircraft type / airline via filename heuristics, and asks the user to
  confirm anything ambiguous.
- Before a flight, the user pulls their SimBrief OFP (or later: enters a
  route manually). FlightSync computes which library addons are required
  (origin, destination, alternates, aircraft, livery) and diffs that
  against what's currently linked.
- The user reviews the diff and applies it. FlightSync creates/removes
  **directory junctions** (Windows) between the library and Community —
  never moves or copies files, never needs Administrator rights.

## 2. Why junctions, not moving files

Two options exist for controlling what MSFS sees in Community:

| Approach | Speed | Risk | Admin rights |
|---|---|---|---|
| Move files in/out | Slow (large sceneries), can leave a half-moved addon if interrupted | High | No |
| **Directory junction/symlink** | Instant | Low — just a pointer, source untouched | **No, if junction (Windows) or symlink (Mac/Linux)** |

Windows symbolic links normally require Administrator privileges, but
**directory junctions** (`mklink /J`, or `fs.symlink(path, target, 'junction')`
in Node) do not. This is why the whole app can run as a normal user — no UAC
prompt, no "run as admin" friction. This is implemented in
`electron/lib/symlinkManager.js`.

## 3. Matching pipeline

```
folder name + manifest.json title
        │
        ▼
  regex ICAO extraction  ──────► exactly one candidate? ─── yes ──► auto-confirmed
        │                                  │
        │                                  no (0 or 2+ candidates)
        ▼                                  ▼
  known-airport-name fallback      user confirms once in
  (small bundled table)            the Library "needs
                                    confirmation" queue
                                            │
                                            ▼
                                  cached forever by addon-folder
                                  hash — never asked again unless
                                  the addon's manifest changes
```

Confirmed in testing: naive `[A-Z]{4}` regex matching produces false
positives from developer studio tags that are themselves 4 uppercase
letters — `ORBX` inside `orbx-ltfm-istanbul` being the first one caught.
Fixed with a maintained exclusion list in `icaoDatabase.js`
(`FALSE_POSITIVE_WORDS`). **This list will need occasional additions** as
new false positives surface in the confirm queue — that's expected and
fine, it degrades gracefully to "one extra manual confirm," never to a
wrong sync.

Aircraft type and airline matching work the same way but against small
curated pattern lists (`AIRCRAFT_TYPE_PATTERNS`, `AIRLINE_PATTERNS` in
`addonScanner.js`) rather than a full ICAO database, since there are far
fewer aircraft types / airlines in a typical hangar than airports in a
typical scenery library.

## 4. Data model

```
Addon {
  id                    // sha1(folder path), stable DB key
  folderName            // e.g. "fspro-eddm-munich-airport"
  absolutePath           // full path inside the library folder
  title                  // manifest title, or folderName
  contentType            // SCENERY | LIVERY | AIRCRAFT | OTHER
  candidateIcaos[]        // everything the heuristic found (may be empty/ambiguous)
  matchedIcao             // confirmed ICAO, null until confirmed (scenery)
  matchedAircraftType     // confirmed ICAO aircraft type (liveries/aircraft)
  matchedAirline          // confirmed ICAO airline code (liveries only)
  confirmed               // bool — has the user verified/overridden this?
  alwaysActive            // bool — never touched by sync (GSX, core utilities, a payware jet you always fly)
  manifestHash             // detects addon updates on rescan, to avoid clobbering user confirmations needlessly
}

FlightPlan {              // normalized SimBrief OFP
  origin, destination, alternates[]
  aircraftIcao, airlineIcao, callsign
}

SyncPlan {
  toLink[]      // Addon[] — need a new junction created
  toUnlink[]    // Addon[] — junction should be removed
  unchanged[]   // Addon[] — already correct
}
```

## 5. Project structure

```
addon-sync/
├── electron/
│   ├── main.js              # window + all IPC handlers
│   ├── preload.js           # narrow contextBridge API -> window.flightsync
│   └── lib/
│       ├── addonScanner.js  # library folder -> Addon[]
│       ├── icaoDatabase.js  # regex matching + bundled name fallback table
│       ├── flightMatcher.js # (FlightPlan, Addon[]) -> required Addon[] (pure fn)
│       ├── symlinkManager.js# diff + apply junctions against Community (ONLY module that writes there)
│       ├── simbriefClient.js# SimBrief OFP fetch + normalize
│       └── db.js            # lowdb persistence (settings, addons, sync history)
├── src/                      # React renderer
│   ├── App.jsx / App.css     # shell: sidebar nav + 3 views
│   ├── components/
│   │   ├── FlightStrip.jsx   # signature element — ATC-strip-styled current route
│   │   ├── ManifestList.jsx  # LED-status addon rows, reused across views
│   │   ├── SyncView.jsx      # pull OFP -> preview plan -> apply
│   │   ├── LibraryView.jsx   # scan + confirm queue + always-active toggles
│   │   └── SettingsView.jsx  # folder pickers, SimBrief pilot ID
│   ├── lib/mockBridge.js     # browser-only mock of window.flightsync, for UI iteration without full Electron
│   └── styles/tokens.css     # design tokens (see §6)
├── vite.config.js
├── index.html
└── package.json
```

**IPC contract** (preload.js exposes `window.flightsync`):

```
settings.get() / settings.update(patch)
dialog.pickFolder(title)
library.scan() / library.list()
addon.confirmMatch(id, patch) / addon.setAlwaysActive(id, value)
simbrief.fetchLatest()
sync.preview(plan) -> { syncPlan, pendingConfirmation }
sync.apply(syncPlan) -> { linked[], unlinked[], errors[] }
sync.history()
```

## 6. Visual direction

Subject-grounded rather than generic dashboard styling: the app borrows
directly from the EFB/avionics world it lives in.

- **Palette**: near-black navy base (`#0B0E14`), PFD/MCDU-derived accents —
  amber `#FFB000` for caution/pending, green `#00E5A0` for active/synced,
  red `#FF4B4B` for errors/to-unlink, cyan `#4FD8FF` for informational.
- **Type**: IBM Plex Mono for anything route/ICAO/status-related (the
  "data" layer), Inter for UI chrome.
- **Signature element**: the current route rendered as a paper-ATC-strip
  banner (`FlightStrip.jsx`) rather than a generic hero/card — large
  monospace `ORIGIN → DEST`, callsign block, aircraft/airline tags.
- **Manifest list**: addon rows styled like a CDU page — small LED status
  dot, monospace ICAO, title, content type, status label.

## 7. Status of this baseline

Built and verified in this session:

- [x] Full project scaffold (Electron + Vite + React, no TypeScript per
      your existing JS codebase style)
- [x] `addonScanner.js` — folder scan, manifest parsing, ICAO/aircraft/airline
      heuristic matching
- [x] `icaoDatabase.js` — regex extraction + bundled name fallback +
      vendor-tag false-positive exclusion (bug found and fixed via smoke test)
- [x] `flightMatcher.js` — pure matching function, unit-testable in isolation
- [x] `symlinkManager.js` — junction-based diff/create/remove, verified
      end-to-end against a real temp directory (scan → match → plan → apply
      → junction confirmed on disk)
- [x] `simbriefClient.js` — OFP fetch/normalize (same API your Flight Strip
      project already uses)
- [x] `db.js` — lowdb persistence with confirmation-preserving rescan logic
- [x] Full IPC wiring (main.js + preload.js)
- [x] Complete React UI — sidebar nav, Route Sync / Library / Settings views,
      EFB-styled design system, mock bridge so the UI can be iterated on in
      a plain browser tab without launching Electron
- [x] `npm install` verified clean, `vite build` verified clean, core logic
      smoke-tested end-to-end on disk

**Not yet built (v1 scope, next steps):**

1. **electron-builder Windows packaging test** — needs a real Windows
   machine or CI runner; can't verify the actual `.exe`/NSIS output from
   this Linux container.
2. **First-run onboarding flow** — currently Settings is a plain tab; should
   probably be a guided first-launch wizard (pick library folder → pick
   Community folder → paste SimBrief ID → first scan) since an empty
   Settings page on first open is a bad first impression.
3. **Bundled ICAO database swap** — replace the ~40 hand-picked airports in
   `icaoDatabase.js` with a build-time-generated table from the OurAirports
   public dataset (already flagged as a TODO in that file).
4. **"Detect Community folder automatically"** — MSFS 2024's Community path
   is discoverable from `%LOCALAPPDATA%\Packages\Microsoft.Limitless_*\LocalCache\Packages\Community`
   (Microsoft Store) or a fixed relative path (Steam) — worth auto-detecting
   in Settings instead of always requiring manual browse.
5. **Sync history view** — `db.js`/`main.js` already record history, just
   needs a UI panel (Settings or a 4th tab) to browse past syncs.
6. **Tests** — the pure functions (`flightMatcher.js`, `icaoDatabase.js`)
   are trivially unit-testable; worth a `vitest` setup before this grows
   much further, especially for the regex matching which is the single
   highest-risk-of-silent-bug piece of the whole app.
7. **Manual route entry** — fallback for flights not planned in SimBrief.

## 8. Update log

**v0.2 — recursive scanning, color-coded UI, route map, visual overhaul**

- `addonScanner.js` now walks the library recursively instead of a flat
  top-level `readdir`. A directory is treated as "an addon" the moment it
  contains `manifest.json` or `layout.json`; anything else is treated as a
  pure category folder (e.g. Addons Linker-style `Airports/`, `Airlines/`)
  and its name is carried forward both as an ICAO-matching hint and as a
  content-type bias when the manifest itself doesn't declare one clearly.
  Verified against a real nested `Airports/EDDM-Munich`,
  `Airlines/A21N-THY` structure end-to-end, including the actual junction
  creation into a test Community folder.
- Every addon now has a `categoryPath` field (e.g. `"Airports"`) shown
  alongside its title everywhere it's listed.
- Content types are color-coded consistently everywhere via
  `src/lib/contentTypeColors.js` — cyan/scenery, amber/livery, green/aircraft,
  purple/other — applied as a left-border accent on every manifest row, with
  a legend + live counts at the top of the Library view.
- New `RouteMap.jsx` — a stylized "Nav Display" style SVG plot of the
  current SimBrief route (origin, destination, sampled navlog waypoints),
  deliberately not a literal world-map/tile widget — no network dependency,
  fits the avionics aesthetic, and needs no API key.
- New `OfpPanel.jsx` — route string, air distance, time enroute, cruise
  altitude, and block fuel pulled from the same SimBrief fetch.
  `simbriefClient.js` extended to pull lat/lon + these OFP numbers.
- Library view gained a search/filter box (name, ICAO, or category) and a
  "last synced" line on the Route Sync view pulled from sync history.
- Full visual pass: bigger default window (1520×960, was 1280×820), bumped
  type scale and spacing tokens, real icons via `lucide-react`, richer
  FlightStrip treatment (glow, bigger route type), gradient/glow accents on
  the sidebar and buttons throughout.

**Known limitation carried forward from this pass:** if two addons in
different category folders happen to share the exact same leaf folder name,
they'll collide when linked into Community (which only supports one folder
per name). Rare in practice, but worth knowing — not yet guarded against.

## 9. Update log — v0.3: single-folder architecture, UI-driven regions, glass UI

**Architecture change — this is the important one.** Earlier versions
required a separate "library" folder kept outside Community, which doesn't
match how anyone actually uses MSFS — there's only ever one real Community
folder. Fixed:

- Settings now only asks for **one folder**: your real Community folder.
- The first time you scan, any addon already sitting directly in Community
  (a real, physical folder) gets silently migrated exactly once: moved into
  a hidden sibling folder (`.flightsync-vault`, next to Community — same
  drive, so the move is an instant metadata operation even for large
  sceneries) and replaced with a link in its original spot. MSFS sees zero
  difference immediately after migration — nothing is disabled or removed,
  it's purely internal bookkeeping.
- From that point on, syncing is just adding/removing those links, exactly
  as before. Nothing is ever deleted — everything always still exists in
  the vault even when unlinked from Community.
- Verified end-to-end with a real simulated Community folder containing 5
  addons: scan correctly migrated all 5 into the vault and replaced them
  with symlinks; a simulated LTFM→EDDM/THY flight then correctly kept only
  the 3 relevant addons linked and unlinked the other 2, with the vault
  still holding all 5 afterward.

**UI-driven regions, replacing folder-based categorization.** Addons Linker
relies on the user manually organizing addons into category folders
(Airports/Middle East/, Airports/Europe/, etc). Replaced that with
automatic + filterable metadata instead:

- `icaoRegions.js` — approximate ICAO-prefix → region lookup (Europe,
  Middle East, Africa, Asia, Oceania, North America, South America).
  Applied automatically to any scenery addon with a confidently-matched
  ICAO. Deliberately approximate (regional prefixes don't map perfectly
  onto real-world regions, Turkey/Russia/Caribbean are the classic edge
  cases) — anything not confidently resolved is left null, same
  auto-first/manual-fallback philosophy as ICAO/aircraft matching
  elsewhere.
- Library view now has a real filter bar: content-type chips (All/Scenery/
  Livery/Aircraft/Other) plus a region dropdown, instead of relying on
  physical folder structure. `ConfirmForm` gained a manual region selector
  for scenery addons so anything auto-detection couldn't resolve is one
  dropdown away from being fixed.
- Also fixed a false-positive matching bug found during this pass: generic
  city-name words that happen to be exactly 4 letters (e.g. "DOHA", "YORK")
  create genuine ambiguity against the real ICAO in the same folder name —
  confirmed this correctly falls back to the manual confirm queue rather
  than guessing wrong, which is exactly the intended behavior.
- Also fixed: ICAO matching used to run even on livery/aircraft folder
  names, where it's meaningless and can produce misleading false-positive
  matches (e.g. "-Real" suffix matching as ICAO "REAL"). Now skipped
  entirely for non-scenery content types.

**Visual overhaul — glassmorphism + motion.** Full redesign on top of the
existing avionics color language (content types still color-coded
cyan/amber/green/purple; ICAO/route data still monospace):

- Every panel (FlightStrip, RouteMap, OfpPanel, manifest lists, sidebar,
  content area) is now a frosted-glass surface — `backdrop-filter: blur()`
  over an animated, slowly drifting colored blob background rendered once
  behind the whole app. This is what makes the blur actually read as
  "glass" rather than a flat semi-transparent box.
- Added `framer-motion` for real interaction animation: spring-animated
  active-tab pill in the sidebar, tab-switch fade/slide transitions,
  staggered list item entrances, animated banner enter/exit, animated
  confirm-form expand/collapse, spring-in flight strip reveal with
  staggered origin/destination text.
- Pill-shaped buttons, glass search/filter chips, glow effects on primary
  actions and content-type LEDs.

Full pipeline re-verified after all of this: `vite build` clean, every
`electron/lib/*.js` file syntax-checked, and the migration → region-tagging
→ sync-plan → apply chain re-run end-to-end against real files on disk.

## 10. Update log — v0.4: bug fixes, smarter matching, richer flight data, themes/i18n

**Real bugs fixed, verified with reproductions:**

- **Rescan never removed stale addons.** `upsertScannedAddons` only ever
  added/updated — an addon deleted from the vault stayed in the library
  list forever as a ghost entry. Fixed to prune any DB entry not present in
  the latest scan. Reproduced and verified: deleted an addon from the
  vault, rescanned, confirmed it disappeared from the DB.
- **Scan failures were silently swallowed.** Permission errors, broken
  folders, anything unreadable just got a `console.warn` nobody would ever
  see. `scanLibrary` now returns `{ addons, warnings }`, and the Library
  view shows an expandable banner listing exactly which folders couldn't be
  read and why — the likely explanation for "doesn't scan the entire
  folder" reports, since previously there was no way to know a folder had
  failed at all.
- **Symlinked category folders could halt migration recursion.** Node's
  `Dirent.isDirectory()` reports the raw entry type, not the resolved
  target — a symlinked folder reports `isSymbolicLink() === true` and
  `isDirectory() === false`, so a directory-only check would silently skip
  descending into it. Now checks both.

**Much smarter auto-matching — the "reduce manual confirmation" ask.**
Being upfront: this is a confidence-scoring heuristic, not a literal AI
model — running a real LLM per-addon inside a shipped desktop app isn't
practical (no safe way to embed an API key, and no guaranteed internet
connection while MSFS is running). What's implemented instead:

- `resolveConfidentIcao()` — when a folder name produces multiple raw ICAO
  candidates (the "OTHH-Doha" / "DOHA" problem from before), it now checks
  for strong positional signals — bracketed `[EDDM]`, string-leading
  `EDDM - Munich`, or corroboration against the known-airport-name table —
  and auto-resolves when exactly one candidate qualifies, instead of
  punting everything ambiguous to manual review. Verified against the
  previously-ambiguous cases: both now resolve correctly. Deliberately
  dropped a looser "code followed by any capitalized word" rule after
  testing showed it produced false positives from coincidental title text.
- Addons with no `content_type` in their manifest AND no category-folder
  hint used to default to `OTHER` and never even attempt ICAO matching —
  fixed to try scenery matching when the folder name is shaped like an
  airport code, since that's a very common real-world case for older/
  simpler packages.
- Aircraft-type and airline pattern lists roughly tripled in size (common
  Airbus/Boeing/regional types, ~20 more airlines).
- End-to-end result on a realistic 6-addon mixed test set: all 6
  auto-confirmed with zero manual review needed (previously several of
  these would have required it).

**Richer SimBrief data + a bigger, more prominent flight strip:**

- Callsign is now the hero element of the flight strip — 42px, with the
  operating airline's (or origin country's, for GA/private) flag emoji
  fading in beside it via `countryFlags.js`. Native emoji, zero network/
  image assets needed.
- `simbriefClient.js` now also pulls weights (ZFW/TOW/landing weight/pax/
  cargo), fuel (block/trip/wind component), cost index, scheduled out/in
  times, and origin/destination METAR — all surfaced in a reorganized,
  sectioned `OfpPanel`.
- `RouteMap` roughly doubled in size and gained a genuine background:
  a dotted landmass silhouette (Europe/Middle East/Africa/Asia/Americas/
  Australia approximated as ellipses, sampled into a dot grid) projected
  through the exact same lat/lon transform as the route itself, so it
  correctly shows the surrounding geography for whatever flight is loaded
  rather than sitting on blank space. Not precise coastline data — no such
  dataset was available to bundle offline in this environment — but
  genuinely geographically positioned and scaled, in the schematic style
  of an airline route-map graphic.

**Light/dark mode + language switching**, both applied via a shared
`AppSettingsContext` so every view reads from one source instead of each
component independently fetching settings:

- Full light theme token set in addition to the existing dark palette,
  toggled via a pill switch in Settings.
- EN/DE/TR translations (matching Devran's own languages) covering
  navigation, primary actions, and section headers — not yet exhaustive
  of every microcopy string in the app, but the core flows are fully
  translated and switch live without a restart.

Full pipeline re-verified after all of the above: `vite build` clean,
every backend file syntax-checked, and a fresh end-to-end run (scan →
auto-match → sync plan → apply) against real files on disk.

## 11. Open decisions for you

- **Livery/aircraft pattern lists are hand-seeded and short right now**
  (`AIRCRAFT_TYPE_PATTERNS`, `AIRLINE_PATTERNS` in `addonScanner.js`) —
  want these to grow to match your actual hangar, or should there be a UI
  for adding custom patterns instead of editing code each time?
- **Enroute scenery** — deliberately out of v1 scope (see earlier
  discussion) — confirm you're fine leaving that out for now.
- **electron-builder vs. Tauri** — went with Electron since it matches your
  existing Node.js/discord.js background and gets you shipping fastest;
  Tauri would be lighter (smaller binary, no Chromium bundle) if you want
  to learn Rust down the line, but that's a rewrite, not a port.
