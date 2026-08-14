# FlightSync

[![Test](https://github.com/realoofran/flightsync/actions/workflows/test.yml/badge.svg)](https://github.com/realoofran/flightsync/actions/workflows/test.yml)

Automatically links only the MSFS 2024 Community-folder addons required for
your currently planned flight. See **PLAN.md** for the full architecture,
data model, and roadmap — read that first.

## Setup

```bash
npm install
```

## Run in development

```bash
npm run dev
```

This starts Vite (renderer, hot-reload) and Electron together. On first
launch, go to **Settings** and set:

1. **MSFS 2024 Community folder** — the one real folder MSFS reads addons
   from, typically under
   `%APPDATA%\Microsoft Flight Simulator 2024\Packages\Community` (same
   location for both the Microsoft Store and Steam versions). That's the
   only folder you need to point the app at — no separate library folder to
   set up. Settings has a "Detect automatically" button that checks this
   plus every Steam library folder.
2. **SimBrief pilot ID or username**.

Then go to **Library → Rescan Community**. The first scan will silently
migrate any addon currently sitting directly in Community into a hidden
vault folder next to it, replacing each with a link — MSFS won't notice
anything changed. Confirm any addons flagged amber (ambiguous auto-match),
then you're ready to use **Route Sync**.

## UI-only iteration (no Electron)

`src/lib/mockBridge.js` fakes `window.flightsync` with sample data, so you
can run just the renderer in a normal browser tab for fast UI iteration:

```bash
npx vite
```

Open the printed localhost URL directly — no `npm run dev`, no Electron
window needed for pure styling/layout work.

## Build

```bash
npm run build   # renderer only
npm run dist    # full packaged app via electron-builder -> release/FlightSync-Setup-<version>.exe
```

The installer is currently **unsigned** (no code-signing certificate). Windows
SmartScreen will show an "Unknown Publisher" warning on first run — click
**More info → Run anyway** to proceed. This is normal for small independent
apps distributed outside the Microsoft Store and does not mean the file is
unsafe; it just isn't signed by a paid, identity-verified certificate.

`signAndEditExecutable` is set to `false` in `package.json`'s `build.win`
block because embedding the app icon into the `.exe` itself (via electron-
builder's bundled `rcedit`) requires Windows to allow creating symbolic
links, which normal (non-elevated, non-Developer-Mode) accounts can't do —
`npm run dist` would otherwise fail outright. The app's window/taskbar icon
is unaffected (set directly at runtime in `electron/main.js`), but the
built `.exe`'s file icon in Explorer/Start Menu will show Electron's default
icon instead of FlightSync's. To get the fully-branded `.exe` icon: enable
**Settings → Privacy & security → For developers → Developer Mode**, remove
the `signAndEditExecutable` line, and rebuild.

## Auto-updates

The app checks GitHub Releases on startup (and via **Settings → Check for
updates**) using `electron-updater` — when a newer version is published,
it downloads in the background and prompts to restart once ready. No
account or API key is required to *receive* updates; publishing one requires
a one-time GitHub repo setup:

1. **Create the repo** (once): go to [github.com/new](https://github.com/new),
   create a repository named `flightsync` under your account. Public or
   private both work with `electron-updater`, but a private repo needs a
   `GH_TOKEN` configured for the app itself to check it — a **public** repo
   is simpler and is what `package.json`'s `build.publish` config assumes.
2. **Check `package.json`'s `build.publish` block** — `owner` is set to
   `"realoofran"`; update it if you ever move the repo to a different
   account, and push the repo there.
3. **Every time you want to ship an update:**
   - Bump `"version"` in `package.json` (e.g. `1.0.0` → `1.0.1`) — required,
     electron-updater compares this against the published release tag.
   - `npm run dist` as usual. Alongside the installer, electron-builder also
     writes `release/latest.yml` — **this file is required**, electron-updater
     reads it to know a new version exists.
   - On GitHub, go to your repo → **Releases → Draft a new release**, tag it
     `v1.0.1` (matching the version you just built), and upload **both**
     `FlightSync-Setup-1.0.1.exe` and `latest.yml` from the `release/`
     folder as release assets. Publish it.
   - Anyone running an older version will see the update within a few
     seconds of launching the app (or immediately if they click "Check for
     updates").

This is deliberately a manual upload step, not a `--publish` CLI flag —
that would need a GitHub personal access token typed into a terminal, which
isn't something to hand off casually. If you later want one-command
publishing, generate a token at
[github.com/settings/tokens](https://github.com/settings/tokens) (scope:
`repo`), set it as the `GH_TOKEN` environment variable yourself, and run
`npx electron-builder --publish always` instead of the manual upload above.

## Privacy & what this app touches

- **Local only.** All settings, scanned addon data, and sync history are
  stored in a local JSON file in Electron's per-user app-data folder — never
  sent anywhere.
- **Outbound network calls, all directly tied to something you did.**
  Pressing "Pull from SimBrief" sends your configured SimBrief pilot ID/
  username to SimBrief's public OFP API (`simbrief.com`) to fetch your
  flight plan. Loading the route map on the Sync tab fetches map tiles from
  OpenStreetMap's public tile server (`tile.openstreetmap.org`) — no
  API key, no account, and no data about you is sent beyond the ordinary
  image requests a browser would make. The "ATC online" panel and "Pull
  from VATSIM" both fetch VATSIM's free, public network-status feed
  (`data.vatsim.net`) — an unauthenticated GET request with no data about
  you attached; "Pull from VATSIM" additionally uses your configured CID
  locally, after the fact, to find your own session in that already-public
  feed, never sending it anywhere. Pressing "Classify with AI" in
  Library sends only the folder name, title, and category path of addons
  the built-in matching couldn't identify — never file contents — to
  Anthropic's API, using an API key you provide yourself in Settings
  (nothing is bundled with the app). None of these calls happen unless
  you're actively using that specific feature. There is no telemetry or
  analytics of any kind.
- **What FlightSync does to your files.** The first time you scan, any addon
  sitting directly in your Community folder is moved once into a hidden
  sibling `.flightsync-vault` folder and replaced with a directory
  junction/link in its original spot — MSFS sees no difference. From then on,
  syncing only adds or removes those junctions; your actual addon files
  always remain in the vault and are never deleted by FlightSync.

## Project layout

See **PLAN.md §5**.
